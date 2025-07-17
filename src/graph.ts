import {
	START,
	END,
	StateGraph,
	StateGraphArgs,
	interrupt,
} from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { AgentState } from "@/state";
import { createOrchestrator } from "@/agents/orchestrator";
import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { createMcpTools } from "@/mcp/mcp-tools";
import { createSpecialistAgent } from "@/agents/specialist";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { subtaskParserNode } from "@/agents/subtask-parser";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { extractAndParseJSON } from "@/utils/json-parser";
import {
	createSubtaskTool,
	generateTaskPromptTool,
} from "@/agents/orchestrator";
import { AnyExpertTask } from "@/utils/task-type";
import { TaskType } from "@/utils/task-type";
import { createSummarizer } from "./agents/summarizer";
import { FOOD_PROMPT, ROUTER_PROMPT, SPOT_PROMPT } from "./agents/prompt";

/**
 * Validates that the message sequence is correct for OpenAI API.
 * Ensures that every tool message is preceded by an AI message with tool_calls.
 */
function validateMessageSequence(messages: BaseMessage[]): BaseMessage[] {
	if (!messages || messages.length === 0) return messages;

	const validatedMessages: BaseMessage[] = [];

	console.log(`Validating message sequence of ${messages.length} messages`);

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];

		if (message instanceof ToolMessage) {
			// Check if the previous message is an AI message with tool_calls
			const prevMessage = validatedMessages[validatedMessages.length - 1];
			if (
				!(prevMessage instanceof AIMessage) ||
				!prevMessage.tool_calls ||
				prevMessage.tool_calls.length === 0
			) {
				// Skip this tool message as it doesn't have a valid preceding AI message
				console.warn(
					`Skipping orphaned tool message: ${message.name} (id: ${message.id})`
				);
				console.warn(
					`Previous message type: ${
						prevMessage?.constructor.name
					}, tool_calls: ${
						prevMessage instanceof AIMessage
							? prevMessage.tool_calls?.length
							: "N/A"
					}`
				);
				continue;
			}

			// Check if this tool message corresponds to a tool call in the previous AI message
			const correspondingToolCall = prevMessage.tool_calls.find(
				(tc) => tc.id === message.tool_call_id
			);

			if (!correspondingToolCall) {
				console.warn(
					`Skipping tool message with unmatched tool_call_id: ${message.tool_call_id}`
				);
				console.warn(
					`Available tool_call_ids: ${prevMessage.tool_calls
						.map((tc) => tc.id)
						.join(", ")}`
				);
				continue;
			}
		}

		validatedMessages.push(message);
	}

	console.log(
		`Validated ${validatedMessages.length} messages (filtered ${
			messages.length - validatedMessages.length
		})`
	);
	return validatedMessages;
}

/**
 * Processes messages from ReAct nodes by keeping only input and final output
 * This helps avoid the issue of intermediate tool calls and responses
 */
function processReActMessages(
	existingMessages: BaseMessage[],
	newMessages: BaseMessage[]
): BaseMessage[] {
	if (!existingMessages || existingMessages.length === 0) return newMessages;
	if (!newMessages || newMessages.length === 0) return existingMessages;

	// For ReAct nodes, we want to keep:
	// 1. All messages up to the point where ReAct started
	// 2. Only the final AI message from ReAct (skip intermediate tool calls)

	// Find the last user or system message in existing messages
	let lastNonReactIndex = existingMessages.length - 1;
	for (let i = existingMessages.length - 1; i >= 0; i--) {
		const msg = existingMessages[i];
		if (!(msg instanceof AIMessage) && !(msg instanceof ToolMessage)) {
			lastNonReactIndex = i;
			break;
		}
	}

	// Keep messages up to the last non-ReAct message
	const baseMessages = existingMessages.slice(0, lastNonReactIndex + 1);

	// From new messages, only keep the final AI message (skip intermediate tool calls)
	const finalAIMessage = newMessages
		.filter((msg) => msg instanceof AIMessage)
		.pop(); // Get the last AI message

	if (finalAIMessage) {
		return [...baseMessages, finalAIMessage];
	}

	// Fallback to original logic if no final AI message found
	return [...existingMessages, ...newMessages];
}

/**
 * Safe message deduplication using multiple strategies
 */
function deduplicateMessages(messages: BaseMessage[]): BaseMessage[] {
	const seen = new Set<string>();
	const result: BaseMessage[] = [];

	for (const message of messages) {
		// Create a unique key based on multiple properties
		const key = `${message.constructor.name}-${message.id || "no-id"}-${
			typeof message.content === "string"
				? message.content.substring(0, 100)
				: JSON.stringify(message.content).substring(0, 100)
		}`;

		if (!seen.has(key)) {
			seen.add(key);
			result.push(message);
		}
	}

	return result;
}

/**
 * Router for the Orchestrator.
 * Decides whether to call tools, wait for user input, or route to the specialist flow.
 * This preserves the original function's return values.
 */
const orchestratorRouter = (
	state: AgentState
): "create_subtask" | "ask_user" => {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
	const msg = lastMessage.content.toString();
	if (msg.includes("task_prompt") || msg.includes("task_type")) {
		console.log("Creating subtasks for following tasks:", msg);
		return "create_subtask";
	}

	// If no tool calls, it's asking the user for information
	console.log("Orchestrator is asking user for information");
	return "ask_user";
};

const subtaskRouter = (
	state: AgentState
):
	| "transportation_specialist"
	| "destination_specialist"
	| "food_specialist"
	| "summary" => {
	if (state.next === TaskType.Transportation) {
		return "transportation_specialist";
	} else if (state.next === TaskType.Attraction) {
		return "destination_specialist";
	} else if (state.next === TaskType.Food) {
		return "food_specialist";
	} else {
		console.warn(
			"Finish subtask execution, move to summarizer",
			state.next
		);
		return "summary";
	}
};

/**
 * Router for the Specialists.
 * This function is called *after* the `create_subtask` tool has been executed.
 * It directs the flow to the correct specialist based on the tool's output.
 */
const specialistRouter = (
	state: AgentState
):
	| "transportation_specialist"
	| "destination_specialist"
	| "food_specialist"
	| "END" => {
	console.log("---ROUTING TO SPECIALIST---");
	const lastMessage = state.messages[state.messages.length - 1];

	if (
		lastMessage instanceof ToolMessage &&
		lastMessage.name === "create_subtask"
	) {
		// Use the robust JSON parser to handle various formats
		const subtask = extractAndParseJSON<AnyExpertTask>(
			lastMessage.content.toString()
		);

		if (subtask) {
			switch (subtask.task_type) {
				case TaskType.Transportation:
					console.log(`Routing to: ${subtask.task_type}`);
					return "transportation_specialist";
				case TaskType.Attraction:
					console.log(`Routing to: ${subtask.task_type}`);
					return "destination_specialist";
				case TaskType.Food:
					console.log(`Routing to: ${subtask.task_type}`);
					return "food_specialist";
				default:
					console.warn(
						"Unknown task type from create_subtask tool:",
						subtask.task_type
					);
					return "END";
			}
		}
	}

	// Default return to ensure all code paths return a value
	console.log("No valid subtask found, ending.");
	return "END";
};

/**
 * Decides what to do after a tool has been executed.
 * This is the core of the new simplified logic.
 */
const afterToolsRouter = (state: AgentState): string => {
	const lastMessage = state.messages[state.messages.length - 1];
	// Check if the last action was the creation of a subtask.
	if (
		lastMessage instanceof ToolMessage &&
		lastMessage.name === "create_subtask"
	) {
		// If so, delegate to the specialist router to find the next node.
		return specialistRouter(state);
	}

	// Check if the last action was generating a task prompt
	if (
		lastMessage instanceof ToolMessage &&
		lastMessage.name === "generate_task_prompt"
	) {
		// Parse the task prompt to determine routing
		try {
			const taskPrompt = JSON.parse(lastMessage.content.toString());
			const inputData =
				taskPrompt.task_prompt_for_expert_agent.input_data;

			// Create a subtask-like object for routing
			const routingData = {
				topic: taskPrompt.task_prompt_for_expert_agent.role_definition.includes(
					"交通"
				)
					? "transportation"
					: "destination",
				origin: inputData.origin,
				destination: inputData.destination,
				departure_date: inputData.date,
			};

			console.log(
				`Routing based on task prompt to: ${routingData.topic}`
			);
			if (routingData.topic === "transportation") {
				return "transportation_specialist";
			}
			if (routingData.topic === "destination") {
				return "destination_specialist";
			}
		} catch (e) {
			console.error("Failed to parse task prompt for routing:", e);
		}
		return "END";
	}

	// Otherwise, it was a regular tool call, so we loop back to the orchestrator.
	return "orchestrator";
};

/**
 * A simple router that decides whether a specialist should call tools or end its turn.
 */
const specialistDecision = (
	state: AgentState
): "call_specialist_tools" | "END" => {
	const lastMessage = state.messages[state.messages.length - 1];
	if (
		lastMessage instanceof AIMessage &&
		lastMessage.tool_calls &&
		lastMessage.tool_calls.length > 0
	) {
		return "call_specialist_tools";
	}
	return "END";
};

/**
 * Creates a wrapped specialist agent that ensures proper message handling
 */
function createSafeSpecialistAgent(
	tools: DynamicStructuredTool[],
	systemMessage: string
) {
	const baseAgent = createSpecialistAgent(tools, systemMessage);

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		try {
			console.log(
				`Running specialist with ${state.messages.length} messages`
			);

			// For specialist nodes, we mainly care about:
			// 1. The initial user request/context
			// 2. The current task being processed
			// We don't need the full ReAct conversation history

			// Get the current task info
			const currentTask = state.subtask[state.currentTaskIndex];
			if (!currentTask) {
				throw new Error("No current task found");
			}

			// Create a minimal message context for the specialist
			const contextMessages = state.messages.filter(
				(msg) =>
					// Keep user messages and system messages
					(!(msg instanceof AIMessage) &&
						!(msg instanceof ToolMessage)) ||
					// Keep the final AI message from orchestrator
					(msg instanceof AIMessage &&
						msg.content.toString().includes("task_prompt"))
			);

			console.log(
				`Filtered to ${contextMessages.length} context messages for specialist`
			);

			const result = await baseAgent.invoke({
				...state,
				messages: contextMessages,
			});

			console.log(`Specialist completed, returning result`);
			return result;
		} catch (error: any) {
			console.error("Error in specialist agent:", error);

			// Return error state to prevent graph from crashing
			return {
				error_message: `Specialist agent error: ${error.message}`,
				messages: state.messages, // Keep existing messages
			};
		}
	};
}

export const initializeGraph = async () => {
	const { tools: mcpTools } = await createMcpTools();

	const orchestratorTools = [
		...mcpTools["time"],
		createSubtaskTool,
		generateTaskPromptTool,
	];
	const orchestratorToolNode = new ToolNode(orchestratorTools);

	// 2. Create the orchestrator agent (the ReAct agent executor)
	const orchestrator = createOrchestrator(orchestratorTools);
	const summarizer = createSummarizer();

	// 3. Create specialist agents and their tool nodes
	const transportTools = [
		...mcpTools["12306-mcp"],
		...mcpTools["variflight"],
	];
	const destinationTools = [...mcpTools["amap-maps"], ...mcpTools["fetch"]];
	const foodTools = [...mcpTools["amap-maps"], ...mcpTools["fetch"]];

	const transportationSpecialist = createSafeSpecialistAgent(
		transportTools,
		ROUTER_PROMPT
	);

	const destinationSpecialist = createSafeSpecialistAgent(
		destinationTools,
		SPOT_PROMPT
	);

	const foodSpecialist = createSafeSpecialistAgent(foodTools, FOOD_PROMPT);

	// 4. Define the graph state. We need to define all channels to match AgentState.
	const graphState: StateGraphArgs<AgentState>["channels"] = {
		messages: {
			value: (x: BaseMessage[], y: BaseMessage[]) => {
				// 更安全的消息合并逻辑
				if (!x || x.length === 0) return y;
				if (!y || y.length === 0) return x;

				// 首先处理ReAct节点的消息
				const processedMessages = processReActMessages(x, y);

				// 然后去重
				const deduplicated = deduplicateMessages(processedMessages);

				// 最后验证消息序列
				const validatedMessages = validateMessageSequence(deduplicated);

				console.log(
					`Message processing: ${x.length} + ${y.length} -> ${processedMessages.length} -> ${deduplicated.length} -> ${validatedMessages.length}`
				);

				return validatedMessages;
			},
			default: () => [],
		},
		next: {
			value: (_x, y) => y,
			default: () => "orchestrator",
		},
		subtask: {
			value: (_x, y) => y,
			default: () => [],
		},
		currentTaskIndex: {
			value: (_x, y) => y,
			default: () => -1,
		},
		memory: {
			value: (x, y) => ({ ...x, ...y }),
			default: () => ({}),
		},
		current_specialist: {
			value: (x, y) => y ?? x,
			default: () => "END",
		},
		error_message: {
			value: (_x, y) => y, // 直接用新值替换
			default: () => undefined,
		},
	};

	// 5. Build the graph with the new, clean architecture
	const workflow = new StateGraph<AgentState>({ channels: graphState })
		// === Nodes ===
		.addNode("orchestrator", orchestrator)
		.addNode("subtask_parser", async (state: AgentState) => {
			try {
				// Validate messages before processing
				const validatedMessages = validateMessageSequence(
					state.messages
				);
				const validatedState = {
					...state,
					messages: validatedMessages,
				};

				return await subtaskParserNode(validatedState);
			} catch (error: any) {
				console.error("Error in subtask_parser:", error);
				return {
					error_message: `Subtask parser error: ${error.message}`,
					messages: state.messages,
				};
			}
		}) // Add the subtask parser node
		.addNode("transportation_specialist", transportationSpecialist)
		.addNode("destination_specialist", destinationSpecialist)
		.addNode("food_specialist", foodSpecialist)
		.addNode("wait_user", interrupt)
		.addNode("summarizer", summarizer)

		// === Edges ===
		.addEdge(START, "orchestrator")

		// --- Phase 1: Orchestrator Loop ---
		.addConditionalEdges("orchestrator", orchestratorRouter, {
			create_subtask: "subtask_parser",
			ask_user: "wait_user",
		})

		// --- Phase 2: Routing after tool execution ---
		.addConditionalEdges("subtask_parser", subtaskRouter, {
			transportation_specialist: "transportation_specialist",
			destination_specialist: "destination_specialist",
			food_specialist: "food_specialist",
			summary: "summarizer",
		})

		// --- Specialist Execution ---
		.addEdge("transportation_specialist", "subtask_parser")
		.addEdge("destination_specialist", "subtask_parser")
		.addEdge("food_specialist", "subtask_parser")
		.addEdge("summarizer", END);

	// 6. Compile and return the graph
	const checkpointer = new MemorySaver();
	const graph = workflow.compile({ checkpointer });
	return graph;
};
