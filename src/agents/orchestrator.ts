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
	const model = ds.llm("deepseek-chat").withConfig({
		tools: tools,
		tool_choice: "auto",
	});

	// The system message defines the agent's objective
	const systemMessage = new SystemMessage({
		// 		content: `你是一个旅游智能调度器。你的目标是逐步收集用户的关键信息（目的地、出发日期、出发地），并将它们填充到一个内部的 'memory' 对象中。
		// 你当前的 memory 如下:
		// <memory>
		// {memory_content}
		// </memory>

		// - **如果信息不完整**: 继续向用户提问以获取缺失的信息，或者使用工具（例如 \`resolve_date\`）来解析和填充 'memory'。
		// - **如果信息完整**: 当 'memory' 中的所有必需信息都收集完毕后，**分析用户的整体意图来决定任务的主题（'topic'）**，然后调用 \`create_subtask\` 工具，将完整的 'memory' 内容连同推断出的 'topic' 一起作为 \`subtask\` 参数提交。
		// - **不要自己编造信息**: 只能使用用户提供的信息或工具返回的结果。`,
		content: `你是一个旅游智能调度器 Agent，运行于一个多 Agent 编排系统中。

你的职责是：
→ **逐步引导用户完成关键信息填充**  
→ **推断本次任务的主题与目标**  
→ **生成并提交子任务列表**（供子 Agent 顺序执行）  
→ **最终整合所有子任务的返回结果，输出完整的旅游建议**

---

## 🗂 核心工作流：

你的主要任务是**回顾整个对话历史**，在你的“内部思考”中，逐步构建一个包含所有必需信息（出发地、目的地、出发日期）的旅行计划。

1.  **回顾历史**：在每次回应前，请务必**重新阅读完整的对话记录**，以确保你没有遗忘任何用户之前提供的信息（比如最开始提到的目的地）。
2.  **使用工具**：如果对话中出现了模糊的信息（如“明天”），请优先使用工具（如 'time_' 工具）进行解析。
3.  **补全信息**：在回顾了历史并使用了工具后，如果发现仍有缺失的关键信息，请向用户提出具体问题来补全它。
4.  **最终提交**：只有当你“内心”的旅行计划完全成型后，才调用 'create_subtask' 工具。

---

## 💡 辅助内存快照：

下方 '<memory>' 标签中的内容，是工具调用后更新的结构化数据快照，可作为你回顾历史时的参考，但**你的主要信息来源永远是完整的对话历史**。

<memory>
{memory_content}
</memory>
## 🧾 所需信息字段：

- 出发地
- 目的地
- 出发日期
- 如果涉及到路线规划或者车票查询,需要添加偏好交通工具

---
---

## ✅ 当 memory 信息完整时：

1. **推断本次出行的主题 topic**（如“周末杭州亲子游”）。
2. 基于 memory 和 topic，调用 'create_subtask' 工具，提交两个子任务：

### 子任务定义如下：

#### 1️⃣ 路线交通规划任务（travel_route）
- 目标：规划从出发地到目的地的交通方式与路线。
- 示例 prompt 给下游 Agent：
  > 请帮我规划从上海到苏州的交通方式，出发时间为 8 月 2 日。

#### 2️⃣ 景点与餐饮推荐任务（poi_recommendation）
- 目标：推荐目的地周边的主要景点与优质餐厅。
- 示例 prompt 给下游 Agent：
  > 我打算 8 月 2 日从上海去苏州旅游，请推荐苏州当地值得去的景点与餐厅。

### 提交格式示例：

\`\`\`json
{
  "memory": {
    "出发地": "上海",
    "目的地": "苏州",
    "出发日期": "2025-08-02"
  },
  "topic": "苏州一日游",
  "subtasks": [
    {
      "type": "travel_route",
      "input": "请规划从上海到苏州的交通方式，出发时间为 8 月 2 日。"
    },
    {
      "type": "poi_recommendation",
      "input": "请推荐苏州在 8 月 2 日适合游客的景点与餐厅。"
    }
  ]
}`,
	});

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		console.log("---ORCHESTRATOR---");
		let { messages, memory } = state;

		// **Core Logic**: Update memory from the last tool call if it exists.
		const lastMessage = messages[messages.length - 1];
		if (lastMessage instanceof ToolMessage) {
			console.log(
				"Orchestrator is updating memory from tool call result with tool output.",
				lastMessage.content
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

		console.log("get ai response in orchestrator:", aiMessage.content);

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
				messages: [aiMessage, toolMessage],
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
				messages: [aiMessage],
				next: "tools",
			};
		}

		// Otherwise, it's a question for the user.
		console.log("Orchestrator is asking the user a question.");
		return {
			messages: [aiMessage],
			next: "ask_user",
		};
	};
};
