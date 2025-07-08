# Orchestrator Pseudo-code using ReAct Agent

This document contains the pseudo-code provided by the user, outlining the implementation of the orchestrator node using a ReAct agent pattern with LangGraph.

## Key Features:

-   **Tool Usage:** Can call tools (e.g., `resolve_date`) to supplement information.
-   **User Interaction:** Can ask the user for clarification if information is missing.
-   **State Management:** Uses a state object with `messages` (history) and `memory` (stored variables).
-   **Subtask Generation:** Creates a structured `subtask` JSON when all necessary information is gathered.

## Pseudo-code

```typescript
import { createReActAgent, ToolExecutor } from "langgraph/agents";
import { type NodeHandler } from "langgraph";
import { ChatOpenAI } from "@langchain/openai";

// 1. 准备 tool registry（包含 date tool）
const tools = [
	{
		name: "resolve_date",
		description: "将如‘明天’这样的时间短语解析为具体日期",
		func: async ({ text }) => {
			const date = resolveToISODate(text); // 你自己实现
			return { date };
		},
	},
	// 你可以扩展更多 tool，比如 weather、location 等
];

const toolExecutor = new ToolExecutor({ tools });

// 2. 创建 LLM 推理链（你可以用 GPT-4o）
const llm = new ChatOpenAI({ modelName: "gpt-4o" });

// 3. 创建 ReAct agent
const reactAgent = createReActAgent({
	llm,
	tools: toolExecutor,
	systemPrompt: `你是一个旅游智能调度器。你的目标是逐步收集用户出行意图中的关键信息：
- 出发日期
- 出发地（可选）
- 目的地
当信息不完整时，你可以选择调用工具（如时间解析），或直接向用户提问。信息收集完成后，请输出 JSON 格式的 subtask。`,
});

// 4. Orchestrator node handler
export const orchestratorNode: NodeHandler = async (state, config) => {
	const history = state["messages"] ?? []; // 多轮历史
	const memory = state["memory"] ?? {}; // 存储变量，如 date, destination 等

	const result = await reactAgent.invoke({
		messages: history,
		memory,
	});

	// 处理 ReAct 结果
	if (result.type === "tool_use") {
		// tool 调用：添加 tool result，继续下一轮
		const toolResult = await toolExecutor.invoke(result.toolInput);
		return {
			messages: [...history, result.toolMessage, toolResult],
			memory: {
				...memory,
				...toolResult, // 如果 tool 返回了 {date: "2025-07-09"}，直接存入
			},
			// 继续下一轮（停留在当前 node）
			return: { status: "continue", next: "orchestrator" },
		};
	}

	if (result.type === "ask_user") {
		// LLM 判断需要用户回答 → 回传 question，等待用户回答
		return {
			messages: [...history, result.aiMessage],
			memory,
			return: { status: "await_user", next: null }, // 等用户输入，图暂停
		};
	}

	if (result.type === "subtask_ready") {
		// 信息补全完毕，生成结构化 subtask，准备跳转
		return {
			...state,
			memory: {
				...memory,
				subtask: result.subtask,
			},
			return: { status: "done", next: "path_planner" },
		};
	}

	// 默认 fallback：继续下一轮
	return {
		messages: [...history, result.aiMessage],
		memory,
		return: { status: "continue", next: "orchestrator" },
	};
};
```
