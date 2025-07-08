import { AgentState } from "../state";
import { Tool, DynamicStructuredTool } from "@langchain/core/tools";
import { DeepSeek } from "../models/deepseek";
import {
	AIMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";

/**
 * The orchestrator is a stateful information collector.
 * Its goal is to use tools to iteratively build up a 'memory' object.
 * Once the memory is complete, it synthesizes it into a 'subtask' JSON object.
 */
export const createOrchestrator = (tools: DynamicStructuredTool[]) => {
	const ds = new DeepSeek();
	// Bind the tools to the model
	const model = ds.llm("deepseek-chat").bind({
		tools: tools,
		tool_choice: "auto",
	});

	// The system message defines the agent's objective
	const systemMessage = new SystemMessage({
		content: `你是一个旅游智能调度器。你的目标是逐步收集用户的关键信息（目的地、出发日期、出发地），并将它们填充到一个内部的 'memory' 对象中。
你当前的 memory 如下:
<memory>
{memory_content}
</memory>

- **如果信息不完整**: 继续向用户提问以获取缺失的信息，或者使用工具（例如 \`resolve_date\`）来解析和填充 'memory'。
- **如果信息完整**: 当 'memory' 中的所有必需信息都收集完毕后，**分析用户的整体意图来决定任务的主题（'topic'）**，然后调用 \`create_subtask\` 工具，将完整的 'memory' 内容连同推断出的 'topic' 一起作为 \`subtask\` 参数提交。
- **不要自己编造信息**: 只能使用用户提供的信息或工具返回的结果。`,
	});

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		console.log("---ORCHESTRATOR---");
		let { messages, memory } = state;

		// **Core Logic**: Update memory from the last tool call if it exists.
		const lastMessage = messages[messages.length - 1];
		if (lastMessage instanceof ToolMessage) {
			console.log(
				"Orchestrator is updating memory from tool call result."
			);
			// This is a simplified merge. A real implementation might need more sophisticated logic.
			try {
				const toolOutput = JSON.parse(lastMessage.content as string);
				// Update memory with the new information from the tool.
				memory = { ...memory, ...toolOutput };
			} catch (e) {
				console.warn(
					"Tool output was not valid JSON, skipping memory update.",
					e
				);
			}
		}

		// Prepare messages for the model, injecting the current memory state.
		const memoryContent = JSON.stringify(memory, null, 2);
		const systemMessageWithMemory = new SystemMessage({
			content: (systemMessage.content as string).replace(
				"{memory_content}",
				memoryContent
			),
		});

		const newMessages = [systemMessageWithMemory, ...messages];

		// Invoke the model with the updated state.
		const result = await model.invoke(newMessages);
		const aiMessage = result as AIMessage;

		// Check if the model decided to create the subtask.
		const subtaskToolCall = aiMessage.tool_calls?.find(
			(toolCall) => toolCall.name === "create_subtask"
		);

		if (subtaskToolCall) {
			console.log(
				"Orchestrator collected all information and is creating a subtask."
			);
			const subtask = subtaskToolCall.args.subtask;
			// We must provide a tool message response to the tool call.
			// This is a "fake" response that indicates the subtask was created.
			// The key is to include a ToolMessage with the same tool_call_id
			// as the one in the AIMessage. This makes the history valid.
			const toolMessage = new ToolMessage({
				tool_call_id: subtaskToolCall.id ?? "",
				content: "Subtask created and ready for routing.",
			});
			return {
				messages: [...messages, aiMessage, toolMessage],
				subtask: subtask,
				next: "router",
			};
		}

		// Check for other tool calls to populate the memory.
		if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
			console.log(
				"Orchestrator decided to call a tool to populate memory."
			);
			// The graph will call the tools and the result will be in the next state.
			return {
				messages: [...messages, aiMessage],
				next: "tools",
			};
		}

		// Otherwise, it's a question for the user.
		console.log("Orchestrator is asking the user a question.");
		return {
			messages: [...messages, aiMessage],
			next: "ask_user",
		};
	};
};
