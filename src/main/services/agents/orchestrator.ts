import { Gemini } from '../models/gemini';
import { z } from 'zod';
import { AgentState, PlanTodo } from '../utils/agent-type';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { TRAVEL_AGENT_PROMPT } from '../prompts/prompt';

// =============== 新的编排逻辑 ===============
// 不再调用外部 todo-planner MCP 工具；改为通过一次“大 meta prompt” 让 LLM 自主决定：
// 1. 是否需要生成一个计划 (plan) 还是可以直接回答 (direct_answer)
// 2. 输出统一 JSON，方便解析

// 约定的模型输出 JSON 结构（任意一部分缺失则忽略）：
// {
//   "thinking": "可选，模型的内部分析",
//   "reason": "如果选择 direct_answer，说明为什么不需要计划",
//   "direct_answer": "如果任务简单或信息不足，直接给出的回答",
//   "plan": [
//       {"description": "要做什么", "category": "research|booking|transportation|accommodation|other", "priority": "high|medium|low"}
//   ]
// }

const PLAN_JSON_SCHEMA = z.object({
    thinking: z.string().optional(),
    reason: z.string().optional(),
    direct_answer: z.string().optional(),
    plan: z
        .array(
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
        )
        .optional(),
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

function convertPlanToTodos(
    plan: Array<{ description: string; category?: string; priority?: string }>
): PlanTodo[] {
    return plan.map((step, idx) => ({
        id: (idx + 1).toString(),
        content: step.description,
        status: 'pending',
        category: (step.category as any) || 'other',
        priority: (step.priority as any) || 'medium',
    }));
}
export const createOrchestrator = () => {
    const llm = new Gemini();
    const model = llm.llm('gemini-2.5-flash'); // 不再绑定工具

    const metaInstruction = `你是一个专业的旅行智能助手。根据用户的输入决定以下两种路径之一：\n\n1) 如果用户的问题很简单（例如：单一事实查询、翻译、非常短的小问题）或者当前信息不足以制定可靠计划，则直接回答问题，返回 JSON 中的 direct_answer，并给出 reason，plan 为空数组。\n2) 如果用户的需求涉及多步骤、需要研究/预订/比较/行程整理等，请输出一个结构化计划 plan（数组）。不要执行，只规划。\n\n输出严格为 JSON（不要附加额外文本、解释或 Markdown），符合以下模式：\n{\n  "thinking": "(可选) 你的内部分析，30~100字以内",\n  "reason": "(可选) 如果选择 direct_answer，解释为何无需计划",\n  "direct_answer": "(可选) 直接给用户的回复内容",\n  "plan": [ { "description": "需要做的动作", "category": "research|booking|transportation|accommodation|activity|other", "priority": "high|medium|low" } ]\n}\n注意：\n- 二选一：要么给 direct_answer（plan 为空或缺失），要么给非空 plan（此时可以不含 direct_answer）。\n- description 要简洁可执行。\n- 严格输出单个 JSON 对象。`;

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        console.log('---ORCHESTRATOR (meta planning)---');
        const { messages } = state;

        // 取最近一条用户消息作为核心需求（可扩展为聚合上下文）
        const lastHuman = messages[messages.length - 1];
        const userContent: string = (lastHuman as any)?.content || '';

        const systemMessage = new SystemMessage({ content: metaInstruction });

        const planningResponse = await model.invoke([systemMessage, ...messages]);
        const rawText = planningResponse.content?.toString() || '';
        console.log('Raw planning response:', rawText);

        const jsonObj = extractFirstJsonBlock(rawText);
        if (!jsonObj) {
            console.warn('未能解析为 JSON，直接当作回答');
            const answerMsg = new AIMessage({ content: rawText });
            return { messages: [answerMsg], next: 'orchestrator' };
        }

        let parsed: any;
        try {
            parsed = PLAN_JSON_SCHEMA.parse(jsonObj);
        } catch (e) {
            console.warn('JSON 不符合预期 schema，作为直接回答处理');
            const answerMsg = new AIMessage({ content: jsonObj.direct_answer || rawText });
            return { messages: [answerMsg], next: 'orchestrator' };
        }

        const plan = parsed.plan && Array.isArray(parsed.plan) ? parsed.plan : [];

        if (plan.length === 0 && parsed.direct_answer) {
            // 直接回答路径
            const answer = parsed.direct_answer;
            const reasoning = parsed.reason ? `\n\n(理由: ${parsed.reason})` : '';
            const answerMsg = new AIMessage({ content: answer + reasoning });
            return { messages: [answerMsg], next: 'orchestrator' };
        }

        if (plan.length > 0) {
            const planTodos = convertPlanToTodos(plan);
            const planSummary = planTodos.map((t) => `- [ ] ${t.content}`).join('\n');
            const intro = `已生成一个多步骤计划，共 ${planTodos.length} 步。你可以选择执行、修改或让助手继续。\n\n${planSummary}`;
            const planMsg = new AIMessage({ content: intro });
            return {
                messages: [planMsg],
                planTodos,
                next: 'orchestrator',
            };
        }

        // 兜底：既没有 plan 也没有 direct_answer
        const fallbackMsg = new AIMessage({
            content: '暂时无法制定计划，请补充更多需求细节（例如目的地/天数/偏好）。',
        });
        return { messages: [fallbackMsg], next: 'orchestrator' };
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
