import { Gemini } from '../models/gemini';
import { z } from 'zod';
import { AgentState } from '../utils/agent-type';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
// NOTE: Legacy prompt imports removed. Keep file minimal for meta planning.

// =============== 新的编排逻辑 ===============
// 不再调用外部 todo-planner MCP 工具；改为通过一次“大 meta prompt” 让 LLM 自主决定：
// 1. 是否需要生成一个计划 (plan) 还是可以直接回答 (direct_answer)
// 2. 输出统一 JSON，方便解析

// 约定的模型输出 JSON 结构（任意一部分缺失则忽略）：
// {
//   "thinking": "可选，模型的内部分析",
//   "direct_answer": "如果任务简单或信息不足，直接给出的回答",
//   "plan": [
//       {"description": "要做什么", "category": "research|booking|transportation|accommodation|other", "priority": "high|medium|low"}
//   ]
// }

// Unified schema for orchestrator output.
const PLAN_JSON_SCHEMA = z.object({
    thinking: z.string().optional(),
    direct_answer: z.string().optional(),
    plan: z.array(
        z.object({
            description: z.string(),
            category: z
                .enum([
                    'research',
                    'booking',
                    'transportation',
                    'accommodation',
                    'activity',
                    'other',
                ])
                .optional(),
            priority: z.enum(['high', 'medium', 'low']).optional(),
        })
    ).optional(),
});

function extractFirstJsonBlock(text: string): any | null {
    // 尝试提取第一个 JSON 对象
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch (e) {
        return null;
    }
}

// Removed convertPlanToTodos – frontend will parse and construct any UI state itself from raw JSON.
export const createOrchestrator = () => {
    const llm = new Gemini();
    const model = llm.llm('gemini-2.5-flash'); // 不再绑定工具

    const metaInstruction = `你是一个专业的旅行智能助手。根据用户的输入决定以下两种路径之一：\n\n1) 如果用户的问题很简单（例如：单一事实查询、翻译、非常短的小问题）或者当前信息不足以制定可靠计划，则直接回答问题，返回 JSON 中的 direct_answer，并给出 thinking，plan 为空数组。\n2) 如果用户的需求涉及多步骤、需要研究/预订/比较/行程整理等，请输出一个结构化计划 plan（数组）。不要执行，只规划。\n\n输出严格为 JSON（不要附加额外文本、解释或 Markdown），符合以下模式：\n{\n  "thinking": "(可选) 你的内部分析，或者为何可以直接回答，30~100字以内",\n   "direct_answer": "(可选) 直接给用户的回复内容",\n  "plan": [ { "description": "需要做的动作", "category": "research|booking|transportation|accommodation|activity|other", "priority": "high|medium|low" } ]\n}\n注意：\n- 二选一：要么给 direct_answer（plan 为空或缺失），要么给非空 plan（此时可以不含 direct_answer）。\n- description 要简洁可执行。\n- 严格输出单个 JSON 对象。`;

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        console.log('---ORCHESTRATOR (meta planning)---');
        const { messages } = state;

        // 取最近一条用户消息（当前不做多轮聚合）
        const lastHuman = messages[messages.length - 1];
        const userContent: string = (lastHuman as any)?.content || '';

        const systemMessage = new SystemMessage({ content: metaInstruction });

        const planningResponse = await model.invoke([systemMessage, ...messages]);
        const rawText = planningResponse.content?.toString() || '';
        console.log('Raw planning response:', rawText);

        const jsonObj = extractFirstJsonBlock(rawText);
        if (!jsonObj) {
            console.warn('未能解析为 JSON，直接包一层 direct_answer');
            const fallback = { direct_answer: rawText };
            return { messages: [new AIMessage({ content: JSON.stringify(fallback) })] };
        }

        // 校验与标准化
        let parsed: any;
        try {
            parsed = PLAN_JSON_SCHEMA.parse(jsonObj);
        } catch (e) {
            console.warn('解析失败，降级 direct_answer');
            const degraded = { direct_answer: jsonObj.direct_answer || rawText };
            return { messages: [new AIMessage({ content: JSON.stringify(degraded) })] };
        }

        const normalized = {
            thinking: parsed.thinking,
            reason: parsed.reason,
            direct_answer: parsed.direct_answer,
            plan: parsed.plan || [],
        };

        // 确保二选一逻辑：如果有 plan 且非空但也有 direct_answer，保留两者由前端自行处理；否则保持原样。
        return { messages: [new AIMessage({ content: JSON.stringify(normalized) })] };
    };
};
// 旧的 ReAct/tool 调用相关代码已移除，保留历史注释以便未来扩展。

// export const createSubtaskTool = new DynamicStructuredTool({
//     name: "create_subtask",
//     description:
//         "Creates a subtask with the collected information when all fields are present.",
//     schema: createTaskSchema,
//     func: async (input: CreateSubtaskInput): Promise<string> => {
//         // The tool's function is just to return the structured data.
// const generateTaskSchema = z.object({
//     task_prompt_for_expert_agent: z.object({
//         role_definition: z.string(),
//         core_goal: z.string(),
//         input_data: z.object({
//             origin: z.string(),
//             destination: z.string(),
//             date: z.string(),
//         }),
//         output_requirements: z.object({
//             format: z.string(),
//             constraints: z.array(z.string()),
//         }),
//         user_persona: z.string(),
//     }),
// });

// type GenerateTaskPromptInput = {
//     task_prompt_for_expert_agent: {
//         role_definition: string;
//         core_goal: string;
//         input_data: {
//             origin: string;
//             destination: string;
//             date: string;
//         };
//         output_requirements: {
//             format: string;
//             constraints: string[];
//         };
//         user_persona: string;
//     };
// };

// // 2. Define the task generation tool with structured output
// export const generateTaskPromptTool = new DynamicStructuredTool({
// const collectUserInfoSchema = z.object({
//     reason: z.string(),
//     missing_fields: z.array(z.string()),
// });

// type CollectUserInfoInput = {
//     reason: string;
//     missing_fields: string[];
// };

// // 3. Define the user interaction tool - simplified to return routing instruction
// export const collectUserInfoTool = new DynamicStructuredTool({
//     name: "collect_user_info",
//     description:
//         "Signals that user interaction is needed to collect missing travel information.",
//     schema: collectUserInfoSchema,
//     func: async (input: CollectUserInfoInput): Promise<string> => {
//         console.log("Orchestrator requesting user interaction:", input.reason);

//         return JSON.stringify({
//             action: "request_user_interaction",
//             reason: input.reason,
//             missing_fields: input.missing_fields,
//             message: `User interaction needed: ${input.reason}`,
//         });
//     },
// });

// // 定义类型
// type CreateSubtaskInput = z.infer<typeof createTaskSchema>;
// type GenerateTaskPromptInput = z.infer<typeof generateTaskSchema>;
// type CollectUserInfoInput = z.infer<typeof collectUserInfoSchema>;
