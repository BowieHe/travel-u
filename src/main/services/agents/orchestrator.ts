import { SystemMessage } from '@langchain/core/messages';
import { DeepSeek } from '../models/deepseek';
import { AgentState } from '../utils/agent-type';
import { ROUTER_PROMPT } from '../prompts/prompt';
import { parseSchema } from '../utils/tool';

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
const ROUTER_SYSTEM_PROMPT = `你是一个路由决策助手，读取“用户最新输入”并输出**严格 JSON**（无解释、无 Markdown、无代码块）。

JSON 结构：
\`\`\`json
{
  "decision": "direct | missingField | planner | agent",
  "missing_fields": null 或 ["destination" | "departure" | "startDate" | "endDate" | "budget" | "travelers" | "preferences"],
  "reasoning": "中文简短解释 (不超过40字)"
}
\`\`\`

判定规则：
1. **direct**：简单问答 / 单事实 / 翻译 / 直接能回答的问题，不需要多步骤。  
2. **planner**：需要多步、研究、比较、或行程/任务拆解（如多天行程、交通/酒店/景点组合）。  
3. **missingField**：用户想做规划或复杂任务，但缺少关键字段（仅可从下列字段中选择）：  
   - "destination"：目的地  
   - "departure"：出发城市  
   - "startDate"：开始日期 (YYYY-MM-DD)  
   - "endDate"：结束日期 (YYYY-MM-DD)  
   - "budget"：总预算  
   - "travelers"：人数  
   - "preferences"：旅行偏好（如 "海滩", "文化"）  
4. **agent**：需要持续监控、自动执行、外部系统交互（如价格跟踪、自动抢票、批量预订等），超出一次性回答或普通规划。  

输出要求：  
- 严格输出 JSON 对象，不包含多余文字、注释、Markdown。  
- 'missing_fields' 为 'null' 或包含一个或多个字段名（从上述字段列表中选择）。  

示例：

用户: 北京现在气温多少？  
输出:
\`\`\`json
{"decision":"direct","missing_fields":null,"reasoning":"简单实时查询意图，可直接回答"}
\`\`\`

用户: 帮我安排一个3天去杭州的行程，想多看自然风景。  
输出:
\`\`\`json
{"decision":"planner","missing_fields":null,"reasoning":"明确出行需求需行程规划"}
\`\`\`

用户: 帮我规划一次去日本的旅行。  
输出:
\`\`\`json
{"decision":"missingField","missing_fields":["startDate","endDate","travelers"],"reasoning":"缺少日期与人数信息"}
\`\`\`

用户: 持续监控上海到东京下周一的最便宜机票，低于2000帮我自动预订。  
输出:
\`\`\`json
{"decision":"agent","missing_fields":null,"reasoning":"需要持续监控和自动执行"}
\`\`\`

现在开始，根据最新用户输入返回 JSON：`;
// 辅助：扁平化模型返回内容
function flattenContent(response: any): string {
    const c = (response as any).content;
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) {
        return c.map((p) => (typeof p === 'string' ? p : p?.text || '')).join('\n');
    }
    return c?.toString?.() || '';
}

export const createRouterNode = () => {
    const ds = new DeepSeek();
    const model = ds.llm('deepseek-chat');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const lastMessage = state.messages[state.messages.length - 1];
        console.log('Router last Message:', lastMessage.content);
        const systemPrompt = new SystemMessage({ content: ROUTER_SYSTEM_PROMPT });

        const response = await model.invoke([systemPrompt, lastMessage]);
        // console.log('get response in orch:', response);
        const raw = flattenContent(response);

        // const routing = parseRouting(raw);
        const routing = parseSchema<Routing>(raw, routingSchema);
        console.log('Routing Decision:', routing);

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
            const existing = state.tripInfo || {};
            const missing = (routing.missing_fields || []).filter((f) => !(existing as any)[f]);
            partial.interactionMissingFields = missing;
        }
        return partial;
    };
};
