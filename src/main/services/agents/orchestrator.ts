import { SystemMessage } from '@langchain/core/messages';
import { DeepSeek } from '../models/deepseek';
import { AgentState } from '../utils/agent-type';
import { ROUTER_PROMPT } from '../prompts/prompt';

import { z } from 'zod';

const routingSchema = z.object({
    /**
     * 路由决策的核心判断，必须是四个预设值之一。
     */
    decision: z.enum(['direct', 'missingField', 'planner', 'agent']),

    /**
     * 当且仅当 decision 为 "missingField" 时，此字段为一个字符串数组，包含缺失的字段名。
     * 在其他情况下，此字段必须为 null。
     */
    missing_fields: z.array(z.string()).nullable(),

    /**
     * AI 做出此决策的简短中文解释。
     */
    reasoning: z.string(),
});

type Routing = z.infer<typeof routingSchema>;

// 为 LLM 设计的 system 提示：只返回 routingSchema 对应 JSON（加入少量示例，提升一致性）
const ROUTER_SYSTEM_PROMPT = `你是一个路由决策助手，读取“用户最新输入”并输出严格 JSON（不要包含解释、Markdown、代码块）。JSON 结构：\n{
  "decision": "direct | missingField | planner | agent",
  "missing_fields": null 或 [字符串...],
  "reasoning": "中文简短解释 (不超过40字)"
}\n判定标准：\n1. direct: 简单问答 / 单事实 / 翻译 / 直接能回答的问题，不需要多步骤。\n2. planner: 需要分多步、研究、比较、行程/任务拆解（旅行天数安排、景点/交通/酒店规划等）。\n3. missingField: 用户想要规划或复杂任务，但缺少关键字段导致无法继续（例如缺少目的地 / 日期范围 / 天数 / 预算等）。列出缺失字段英文或中文描述，如 ["destination", "dates"].\n4. agent: 需要长时间监控、自动执行、外部系统交互（价格跟踪、自动抢票、批量预订等）——超出一次性回答或普通规划。\n输出要求：只输出 JSON 对象，无额外文字。\n\n示例：\n[EXAMPLE 1]\n用户: 北京现在气温多少？\n输出: {"decision":"direct","missing_fields":null,"reasoning":"简单实时查询意图，可直接回答"}\n[EXAMPLE 2]\n用户: 帮我安排一个3天去杭州的行程，想多看自然风景。\n输出: {"decision":"planner","missing_fields":null,"reasoning":"明确出行需求需行程规划"}\n[EXAMPLE 3]\n用户: 帮我规划一次去日本的旅行。\n输出: {"decision":"missingField","missing_fields":["dates","days","cities"],"reasoning":"缺少日期天数与具体城市"}\n[EXAMPLE 4]\n用户: 持续监控上海到东京下周一的最便宜机票，低于2000帮我自动预订。\n输出: {"decision":"agent","missing_fields":null,"reasoning":"需要持续监控和自动执行"}\n\n现在开始，根据最新用户输入返回 JSON：`;

// 辅助：扁平化模型返回内容
function flattenContent(response: any): string {
    const c = (response as any).content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
        return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
    }
    return c?.toString?.() || '';
}

// 辅助：解析 routing，失败则返回降级对象
function parseRouting(raw: string): Routing {
    // 首先尝试直接 JSON.parse
    const directTry = () => {
        try {
            return routingSchema.parse(JSON.parse(raw));
        } catch {
            return null;
        }
    };
    let parsed: Routing | null = directTry();
    if (!parsed) {
        // 提取首个 JSON 花括号
        const match = raw.match(/\{[\s\S]*?\}/);
        if (match) {
            try {
                parsed = routingSchema.parse(JSON.parse(match[0]));
            } catch {
                /* ignore */
            }
        }
    }
    return (
        parsed ||
        ({
            decision: 'planner',
            missing_fields: null,
            reasoning: '降级：解析失败默认规划',
        } as Routing)
    );
}

export const createRouterNode = () => {
    const ds = new DeepSeek();
    const model = ds.llm('deepseek-chat');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const lastMessage = state.messages[state.messages.length - 1];
        const systemPrompt = new SystemMessage({ content: ROUTER_SYSTEM_PROMPT });

        const response = await model.invoke([systemPrompt, lastMessage]);
        // console.log('get response in orch:', response);
        const raw = flattenContent(response);

        const routing = parseRouting(raw);

        // 决策 -> next 映射
        let next: AgentState['next'];
        switch (routing.decision) {
            case 'direct':
                next = 'direct_answer';
                break;
            case 'planner':
                next = 'planner';
                break;
            case 'missingField':
                next = 'ask_user';
                break;
            case 'agent':
                next = 'agent_placeholder';
                break;
            default:
                next = 'direct_answer';
        }

        const memory = { ...(state.memory || {}), routing };
        const partial: Partial<AgentState> = { memory, next };
        if (routing.decision === 'missingField') {
            const existing = state.tripPlan || {};
            const missing = (routing.missing_fields || []).filter((f) => !(existing as any)[f]);
            partial.interactionMissingFields = missing;
            partial.interactionAskedFields = [];
        }
        return partial;
    };
};
