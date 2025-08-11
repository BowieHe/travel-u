import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { Gemini } from '../models/gemini';
import { AgentState } from '../utils/agent-type';
import { PLAN_JSON_SCHEMA, PlanJson } from './plan-schema';

// Prompt for direct answer mode with examples guiding concise factual responses.
const DIRECT_PROMPT = `你是一个旅行助手，当前模式: 直接回答 (direct answer)。
用户的问题被分类为 "direct"，意味着它不需要多步骤规划。
任务: 直接回答问题；如果用户的问题含糊不清，可礼貌指出需要补充的点，但不要进入规划。
输出严格为单个 JSON，无额外文本/Markdown。结构:
{
  "thinking": "(可选) 你的内部简短推理，<=50字",
  "direct_answer": "(必填) 给用户的直接回答",
  "plan": []   // direct 模式下应为空或省略
}
注意:
- 不生成 plan。
- 不包含多余礼貌寒暄（除非用户使用寒暄语）。

示例1:
用户: "北京今天的天气怎么样?"
输出: {"thinking":"天气是单一事实，可直接回答","direct_answer":"北京今天多云，最高26℃，最低18℃，适合户外活动。","plan":[]}

示例2:
用户: "翻译: 早上好，请问博物馆几点开门?"
输出: {"thinking":"简单翻译请求","direct_answer":"早上好，请问博物馆几点开门? -> Good morning, what time does the museum open?","plan":[]}

示例3:
用户: "我想去日本，帮我安排行程"
输出: {"thinking":"此需求需要规划，按 direct 模式提示补充","direct_answer":"这个需求需要更详细的信息（例如天数、出发日期、预算），请补充后我再帮你规划。","plan":[]}

现在开始：`;

function extractFirstJson(text: string): any | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch {
        return null;
    }
}

export const createDirectAnswerNode = () => {
    const llm = new Gemini();
    const model = llm.llm('gemini-2.5-flash');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const system = new SystemMessage({ content: DIRECT_PROMPT });
        const last = state.messages[state.messages.length - 1];
        const resp = await model.invoke([system, ...state.messages]);
        const raw = resp.content?.toString() || '';
        const jsonObj = extractFirstJson(raw) || { direct_answer: raw, plan: [] };

        let parsed: PlanJson;
        try {
            parsed = PLAN_JSON_SCHEMA.parse(jsonObj);
        } catch {
            parsed = { direct_answer: jsonObj.direct_answer || raw, plan: [] };
        }

        // 强制 direct 模式不返回计划
        parsed.plan = [];

        return { messages: [new AIMessage({ content: JSON.stringify(parsed) })] };
    };
};
