import { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { Gemini } from "@/models/gemini";
import { z } from "zod";
import { TRAVEL_AGENT_PROMPT } from "./prompt";

/**
 * Creates a ReAct agent that will function as the orchestrator.
 * This agent's primary goal is to gather information and then call
 * the 'create_subtask' tool once all necessary information is collected.
 *
 * @param tools The list of tools the agent can use, including 'create_subtask'.
 * @returns A compiled agent executor runnable.
 */
export const createOrchestrator = (tools: DynamicStructuredTool[]) => {
	const llm = new Gemini();
	const model = llm.llm("gemini-2.5-flash");

	const systemPrompt = `
你是一个旅游智能调度器 Agent，运行于一个多 Agent 编排系统中。你的职责是：
→ **逐步引导用户完成关键信息填充**
→ **推断本次任务的主题与目标**
→ **在所有信息集齐后，调用generate_task_prompt工具生成结构化任务指令**

---
## 🗂 核心工作流 (ReAct模式)：
你的主要任务是**回顾整个对话历史**和**当前的memory快照**，通过"思考->行动"的循环，逐步构建一个包含所有必需信息的旅行计划。

1.  **回顾历史与记忆**: 在每次回应前，务必**重新阅读完整的对话记录**和下方 **<memory> 快照**，确保你没有遗漏任何关键信息。
2.  **思考**: 根据现有信息，判断下一步行动。
3.  **行动**:
    *   如果对话中出现了模糊的时间信息（如"明天"、"后天"、"下周"等），**必须**先调用 'time_' 工具获取当前系统时间。
    *   获取当前系统时间后，结合用户的相对时间描述（如"后天"），**推算出具体的日期**，并将结果更新到 memory 的 'departure_date' 字段。
    *   如果发现仍有缺失的关键信息（出发地、目的地、出发日期），**必须**向用户提出具体问题来补全它。
    *   **当且仅当**所有必需信息（出发地、目的地、出发日期）都已在 **<memory> 快照** 中清晰存在时，**必须**调用 \`generate_task_prompt\` 工具生成结构化任务指令。

---
## ✅ 当 memory 信息完整时，调用 generate_task_prompt 工具的规则：

1.  **推断主题 (topic)**：根据用户的核心意图，判断任务类型：
    *   如果用户主要关注交通出行（如机票、火车票查询或预订），则为交通规划任务
    *   如果用户主要关注目的地探索（如景点、行程规划），则为目的地规划任务

2.  **调用工具**: 根据推断出的任务类型，调用 \`generate_task_prompt\` 工具并传入以下参数：

**对于交通规划任务：**
\`\`\`
{
  "task_prompt_for_expert_agent": {
    "role_definition": "你是一位顶级的交通规划专家。",
    "core_goal": "根据用户提供的出发地、目的地和日期，查询并对比最优的交通方案（包括飞机和火车，如果适用）。",
    "input_data": {
      "origin": "\${memory中的origin}",
      "destination": "\${memory中的destination}",
      "date": "\${memory中的departure_date}"
    },
    "output_requirements": {
      "format": "以Markdown表格形式呈现结果，列标题应包括：'交通方式', '班次/航班号', '出发时间', '抵达时间', '耗时', '预估价格'。",
      "constraints": [
        "提供至少3个不同的选项。",
        "信息必须准确、时效性强且内容丰富。",
        "回复必须直接、切中要害，避免不必要的寒暄。"
      ]
    },
    "user_persona": "用户是一位追求高效率的旅行者，希望获得清晰、可直接用于决策的建议。"
  }
}
\`\`\`

**对于目的地规划任务：**
\`\`\`
{
  "task_prompt_for_expert_agent": {
    "role_definition": "你是一位顶级的\${memory中的destination}专家。",
    "core_goal": "根据用户提供的目的地和日期，设计一份详实且有趣的一日游行程方案。",
    "input_data": {
      "origin": "\${memory中的origin}",
      "destination": "\${memory中的destination}",
      "date": "\${memory中的departure_date}"
    },
    "output_requirements": {
      "format": "以时间线的方式呈现行程，清晰地列出上午、下午、晚上的活动安排，包括景点名称、简要介绍、建议停留时间和餐饮推荐。",
      "constraints": [
        "提供至少3个不同的选项。",
        "信息必须准确、时效性强且内容丰富。",
        "回复必须直接、切中要害，避免不必要的寒暄。"
      ]
    },
    "user_persona": "用户是一位追求高效率的旅行者，希望获得清晰、可直接用于决策的建议。"
  }
}
\`\`\`

---
## 💡 辅助内存快照：
下方 '<memory>' 标签中的内容，是工具调用后更新的结构化数据快照。**这是你判断信息是否完整的唯一依据。**
<memory>
\${memory_content}
</memory>
---
## ⚠️ 严格规则：
*   你的任务是调用工具或向用户提问，而不是闲聊。
*   当 memory 信息完整时:
    1. **必须** 立即调用 \`generate_task_prompt\` 工具
    2. **不要** 在工具调用前后添加任何解释或确认信息
	3. 在调用完成后，直接返回工具的输出结果
*   如果信息不完整:
    1. 向用户提出明确的问题来收集缺失信息
    2. 保持提问简洁，一次只问一个问题
*   **绝对禁止**:
    1. 在工具调用后添加任何确认或总结信息
    2. 在对话中直接输出JSON格式的任务指令
    3. 进行任何形式的寒暄或闲聊
`;

	// The agent executor is a self-contained runnable that handles the ReAct loop.
	const agentExecutor = createReactAgent({
		llm: model,
		tools,
		prompt: TRAVEL_AGENT_PROMPT, // Pass the prompt template directly
	});

	return agentExecutor;

	// return async (state: AgentState): Promise<Partial<AgentState>> => {
	// 	console.log("---ORCHESTRATOR---");
	// 	let { messages, memory } = state;

	// 	// **Core Logic**: Update memory from the last tool call if it exists.
	// 	const lastMessage = messages[messages.length - 1];
	// 	if (lastMessage instanceof ToolMessage) {
	// 		console.log(
	// 			"Orchestrator is updating memory from tool call result with tool output.",
	// 			lastMessage.content
	// 		);
	// 		// This is a simplified merge. A real implementation might need more sophisticated logic.
	// 		try {
	// 			const toolOutput = JSON.parse(lastMessage.content as string);
	// 			// Update memory with the new information from the tool.
	// 			memory = { ...memory, ...toolOutput };
	// 		} catch (e) {
	// 			console.warn(
	// 				"Tool output was not valid JSON, skipping memory update.",
	// 				e
	// 			);
	// 		}
	// 	}

	// 	// Directly construct the system message with the updated memory.
	// 	const memoryContent = JSON.stringify(memory, null, 2);
	// 	const finalSystemMessage = new SystemMessage({
	// 		content: systemPrompt.replace("{memory_content}", memoryContent),
	// 	});

	// 	// Invoke the agent with the final system message and the rest of the history.
	// 	const result = await agentExecutor.invoke({
	// 		messages: [finalSystemMessage, ...messages],
	// 	});

	// 	// The result will be a list of messages that need to be added to the state.
	// 	const aiMessage = result.messages[
	// 		result.messages.length - 1
	// 	] as AIMessage;

	// 	console.log("get ai response in orchestrator:", aiMessage.content);

	// 	// Check if the model decided to create the subtask.
	// 	const subtaskToolCall = aiMessage.tool_calls?.find(
	// 		(toolCall) => toolCall.name === "create_subtask"
	// 	);

	// 	if (subtaskToolCall) {
	// 		console.log(
	// 			"Orchestrator collected all information and is creating a subtask."
	// 		);
	// 		const subtask = subtaskToolCall.args.subtask;
	// 		// We must provide a tool message response to the tool call.
	// 		// This is a "fake" response that indicates the subtask was created.
	// 		// The key is to include a ToolMessage with the same tool_call_id
	// 		// as the one in the AIMessage. This makes the history valid.
	// 		const toolMessage = new ToolMessage({
	// 			tool_call_id: subtaskToolCall.id ?? "",
	// 			content: "Subtask created and ready for routing.",
	// 		});
	// 		return {
	// 			messages: [aiMessage, toolMessage],
	// 			subtask: subtask,
	// 			memory: memory, // <-- **FIX**: Return the updated memory
	// 			next: "router",
	// 		};
	// 	}

	// 	// Check for other tool calls to populate the memory.
	// 	if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
	// 		console.log(
	// 			"Orchestrator decided to call a tool to populate memory."
	// 		);
	// 		// The graph will call the tools and the result will be in the next state.
	// 		return {
	// 			messages: [aiMessage],
	// 			memory: memory, // <-- **FIX**: Return the updated memory
	// 			next: "tools",
	// 		};
	// 	}

	// 	// Otherwise, it's a question for the user.
	// 	console.log("Orchestrator is asking the user a question.");
	// 	return {
	// 		messages: [aiMessage],
	// 		memory: memory, // <-- **FIX**: Return the updated memory
	// 		next: "ask_user",
	// 	};
	// };
};

export const createSubtaskTool = new DynamicStructuredTool({
	name: "create_subtask",
	description:
		"Creates a subtask with the collected information when all fields are present.",
	schema: z.object({
		topic: z
			.string()
			.describe(
				"The topic of the request, inferred from the user's intent. Should be one of: 'transportation', 'destination'."
			),
		destination: z.string().describe("The final destination."),
		departure_date: z
			.string()
			.describe("The machine-readable departure date."),
		origin: z.string().describe("The starting point of the journey."),
	}),
	func: async (input) => {
		// The tool's function is just to return the structured data.
		return JSON.stringify(input);
	},
});

// 2. Define the task generation tool with structured output
export const generateTaskPromptTool = new DynamicStructuredTool({
	name: "generate_task_prompt",
	description:
		"Generates a structured task prompt for the specialist agent when all required information is collected.",
	schema: z.object({
		task_prompt_for_expert_agent: z.object({
			role_definition: z
				.string()
				.describe("The role definition for the specialist agent"),
			core_goal: z
				.string()
				.describe("The core goal description for the task"),
			input_data: z.object({
				origin: z
					.string()
					.describe("The starting point of the journey"),
				destination: z.string().describe("The final destination"),
				date: z.string().describe("The departure date"),
			}),
			output_requirements: z.object({
				format: z
					.string()
					.describe("The format instructions for the output"),
				constraints: z
					.array(z.string())
					.describe("List of constraints for the output"),
			}),
			user_persona: z
				.string()
				.describe("Description of the user persona"),
		}),
	}),
	func: async (input) => {
		// Return the structured task prompt
		return JSON.stringify(input);
	},
});
