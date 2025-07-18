import { START, END, StateGraph } from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { AgentState } from "@/types/type";
import { createOrchestrator } from "@/agents/orchestrator";
import { createMcpTools } from "@/mcp/mcp-tools";
import { subtaskParserNode } from "@/agents/subtask-parser";
import {
	createSubtaskTool,
	generateTaskPromptTool,
} from "@/agents/orchestrator";
import { TaskType } from "@/utils/task-type";
import { createSummarizer } from "@/agents/summarizer";
import { FOOD_PROMPT, ROUTER_PROMPT, SPOT_PROMPT } from "@/agents/prompt";
import { createSafeSpecialistAgent } from "@/agents/specialist";
import { graphState } from "@/types/state";
import { validateMessageSequence } from "@/types/state";
import { createUserInteractionSubgraph } from "@/subgraph/user-interaction/graph";

/**
 * Router for the Orchestrator.
 * Decides whether to call tools, wait for user input, or route to the specialist flow.
 */
const orchestratorRouter = (
	state: AgentState
): "subtask_parser" | "ask_user" | "orchestrator" => {
	// Handle error cases
	if (state.errorMessage) {
		console.log("Orchestrator encountered error, asking user");
		return "ask_user";
	}

	// Route based on next state
	if (state.next === "subtask_parser") {
		console.log("Creating subtasks for following tasks");
		return "subtask_parser";
	} else if (state.next === "ask_user") {
		console.log("Orchestrator is asking user for information");
		return "ask_user";
	}

	// Default fallback
	console.log("Orchestrator default: asking user for information");
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

export const initializeGraph = async () => {
	const { tools: mcpTools } = await createMcpTools();

	const orchestratorTools = [
		...mcpTools["time"],
		createSubtaskTool,
		generateTaskPromptTool,
	];

	// 2. Create the orchestrator agent (the ReAct agent executor)
	const orchestrator = createOrchestrator(orchestratorTools);
	const userInteractionSubgraph = createUserInteractionSubgraph(); // 直接调用，无需 await/compile
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
		})
		.addNode("transportation_specialist", transportationSpecialist)
		.addNode("destination_specialist", destinationSpecialist)
		.addNode("food_specialist", foodSpecialist)
		// .addNode("ask_user", interrupt)
		.addNode("ask_user", userInteractionSubgraph)
		.addNode("summarizer", summarizer)

		// === Edges ===
		.addEdge(START, "orchestrator")

		// --- Phase 1: Orchestrator Loop ---
		.addConditionalEdges("orchestrator", orchestratorRouter, {
			subtask_parser: "subtask_parser",
			ask_user: "ask_user",
			orchestrator: "orchestrator",
		})

		// --- Add edge from ask_user back to orchestrator ---
		.addEdge("ask_user", "orchestrator")

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
	const graphObj = await graph.getGraphAsync();
	const mermaidString = graphObj.drawMermaid();
	console.log("Mermaid Graph Definition:\n", mermaidString);

	return graph;
};
