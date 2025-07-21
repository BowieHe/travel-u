import { DynamicStructuredTool } from "@langchain/core/tools";
import { Gemini } from "@/models/gemini";
import { z } from "zod";
import { AgentState } from "@/types/type";
import {
    AIMessage,
    SystemMessage,
    ToolMessage,
} from "@langchain/core/messages";

/**
 * Creates a regular orchestrator node that handles tool calls directly.
 * This replaces the ReAct agent with a more controlled approach.
 *
 * @param tools The list of tools the agent can use, including 'create_subtask'.
 * @returns A node function that can be used in the graph.
 */
export const createOrchestrator = (tools: DynamicStructuredTool[]) => {
    const llm = new Gemini();
    const model = llm.llm("gemini-2.5-flash").bindTools(tools);

    const systemPrompt = `
你是一个旅游智能调度器 Agent，运行于一个多 Agent 编排系统中。你的职责是：
→ **分析用户需求和当前信息完整性**
→ **调度相应的工具来收集信息或执行任务**
→ **在所有信息集齐后，调用generate_task_prompt工具生成结构化任务指令**

---
## 🗂 核心工作流：
你的主要任务是**分析当前的memory快照**，判断信息完整性，并调度相应的工具。

1.  **分析当前状态**: 检查下方 **<memory> 快照** 中的信息完整性
2.  **必须调用工具**:
    *   如果对话中出现了模糊的时间信息（如"明天"、"后天"、"下周"等），**必须**先调用 time 工具获取当前系统时间。
    *   如果发现缺失关键信息（出发地、目的地、出发日期等），**必须**调用 \`collect_user_info\` 工具：
        \`\`\`json
        {
          "reason": "缺少出发地和出发日期信息",
          "missing_fields": ["origin", "departure_date"]
        }
        \`\`\`
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
{memory_content}
</memory>
---
## ⚠️ 严格规则：
*   你**必须**调用工具，绝对不能直接回复文本。
*   当 memory 信息完整时:
    1. **必须** 立即调用 \`generate_task_prompt\` 工具
*   如果信息不完整:
    1. **必须** 调用 \`collect_user_info\` 工具，并说明缺失的字段
*   如果有模糊的时间信息:
    1. **必须** 先调用相应的时间工具
*   **绝对禁止**:
    1. 直接回复任何文本消息
    2. 不调用工具就结束回合
    3. 进行任何形式的寒暄或闲聊

**重要：你的每次回应都必须包含工具调用，不允许有任何例外。**
`;

    // Create a tool map for quick lookup
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        console.log("---ORCHESTRATOR---");

        let { messages, memory } = state;

        // Update memory from the last tool call if it exists
        const lastMessage = messages[messages.length - 1];
        if (lastMessage instanceof ToolMessage) {
            console.log(
                "Orchestrator is updating memory from tool call result:",
                lastMessage.content
            );
            try {
                const toolOutput = JSON.parse(lastMessage.content as string);
                memory = { ...memory, ...toolOutput };
            } catch (e) {
                console.warn(
                    "Tool output was not valid JSON, skipping memory update.",
                    e
                );
            }
        }

        // 检查必需信息是否完整
        const hasOrigin = memory.origin && memory.origin.trim().length > 0;
        const hasDestination =
            memory.destination && memory.destination.trim().length > 0;
        const hasDepartureDate =
            memory.departure_date && memory.departure_date.trim().length > 0;

        console.log("信息完整性检查:", {
            hasOrigin,
            hasDestination,
            hasDepartureDate,
            memory,
        });

        // If information is missing, the AI should call collect_user_info tool
        if (!hasOrigin || !hasDestination || !hasDepartureDate) {
            console.log("信息不完整，AI应该调用 collect_user_info 工具");
        } else {
            console.log("信息完整，AI应该调用 generate_task_prompt 工具");
        }

        // Create system message with current memory
        const memoryContent = JSON.stringify(memory, null, 2);
        const systemMessage = new SystemMessage({
            content: systemPrompt.replace("{memory_content}", memoryContent),
        });

        // Invoke the model with system message and conversation history
        const result = await model.invoke([systemMessage, ...messages]);
        const aiMessage = result as AIMessage;

        console.log("Orchestrator AI response:", aiMessage.content);

        // Handle tool calls if present
        if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
            const toolCall = aiMessage.tool_calls[0];
            const tool = toolMap.get(toolCall.name);

            if (!tool) {
                console.error(`Tool ${toolCall.name} not found`);
                return {
                    messages: [aiMessage],
                    memory,
                    errorMessage: `Tool ${toolCall.name} not found`,
                };
            }

            try {
                console.log(
                    `Orchestrator calling tool: ${toolCall.name}`,
                    toolCall.args
                );

                // For collect_user_info tool, pass the current state
                let toolConfig = {};
                if (toolCall.name === "collect_user_info") {
                    toolConfig = {
                        configurable: {
                            currentState: { ...state, memory },
                            thread_id: "user_interaction",
                        },
                    };
                }

                const toolResult = await tool.func(
                    toolCall.args,
                    undefined,
                    toolConfig
                );

                const toolMessage = new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    content: toolResult,
                });

                // Handle different tool types
                if (toolCall.name === "generate_task_prompt") {
                    console.log(
                        "Orchestrator generated task prompt, moving to subtask creation"
                    );
                    return {
                        messages: [aiMessage, toolMessage],
                        memory,
                        next: "subtask_parser",
                    };
                } else if (toolCall.name === "create_subtask") {
                    console.log(
                        "Orchestrator created subtask, ready for routing"
                    );
                    const subtaskData = JSON.parse(toolResult);
                    return {
                        messages: [aiMessage, toolMessage],
                        subtask: [subtaskData],
                        memory: { ...memory, ...subtaskData },
                        next: "router",
                    };
                } else if (toolCall.name === "collect_user_info") {
                    console.log("Orchestrator requesting user interaction");
                    // Parse the result and set routing flag
                    const userInteractionRequest = JSON.parse(toolResult);

                    return {
                        messages: [aiMessage, toolMessage],
                        memory,
                        user_interaction_complete: false,
                        next: "ask_user",
                    };
                } else {
                    // For other tools (like time tools), continue the conversation
                    console.log(
                        "Orchestrator called utility tool, continuing conversation"
                    );
                    return {
                        messages: [aiMessage, toolMessage],
                        memory,
                        next: "orchestrator",
                    };
                }
            } catch (error: any) {
                console.error(`Error calling tool ${toolCall.name}:`, error);
                const errorMessage = new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    content: `Error: ${error.message}`,
                });
                return {
                    messages: [aiMessage, errorMessage],
                    memory,
                    errorMessage: error.message,
                };
            }
        }

        // If AI responds without tool calls, force user interaction
        console.log(
            "WARNING: AI responded without tool calls, forcing user interaction"
        );
        console.log("AI response content:", aiMessage.content);

        // Force user interaction by setting the appropriate state
        return {
            messages: [aiMessage],
            memory,
            user_interaction_complete: false,
            next: "ask_user",
        };
    };
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

// 3. Define the user interaction tool - simplified to return routing instruction
export const collectUserInfoTool = new DynamicStructuredTool({
    name: "collect_user_info",
    description:
        "Signals that user interaction is needed to collect missing travel information.",
    schema: z.object({
        reason: z
            .string()
            .describe(
                "The reason for collecting user information (e.g., 'missing destination information')"
            ),
        missing_fields: z
            .array(z.string())
            .describe("List of missing fields that need to be collected"),
    }),
    func: async (input) => {
        console.log("Orchestrator requesting user interaction:", input.reason);

        return JSON.stringify({
            action: "request_user_interaction",
            reason: input.reason,
            missing_fields: input.missing_fields,
            message: `User interaction needed: ${input.reason}`,
        });
    },
});
