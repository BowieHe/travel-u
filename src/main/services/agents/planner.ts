import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { DeepSeek } from '../models/deepseek';
import { AgentState } from '../utils/agent-type';
import { PLAN_JSON_SCHEMA, PlanJson } from './plan-schema';

// Prompt for planner mode; generate multi-step travel plan tasks only.
const PLANNER_PROMPT = `你是一个旅行规划助手，当前模式: 规划 (planner)。
用户的需求需要多步骤规划：请输出一个结构化的 plan 列表；只有在确实需要立即给出简短答复时才添加 direct_answer。
输出严格为一个 JSON，无额外文本/Markdown：
{
  "thinking": "(可选) 你的内部分析，40~120字，可说明拆分依据",
  "direct_answer": "(可选) 一句总结性回应 (如果很必要)",
  "plan": [
     { "description": "单一可执行动作", "category": "research|booking|transportation|accommodation|activity|other", "priority": "high|medium|low" },
     ...
  ]
}
规则：
- plan 必须非空。
- description 以动词开头，具体、避免含糊（不要写“继续沟通”之类）。
- 避免把同一天多个动作混在一条里；拆分。
- 不执行，只规划。
- 如果信息不足以做高质量规划，优先在 direct_answer 中友好说明需要用户补哪些信息，再给你能给出的初步 plan（可标注优先级=low）。

示例1:
用户: "安排3天杭州行程，喜欢自然和历史，不想太累。"
输出: {"thinking":"识别关键词 自然 历史 轻松 3天，拆分按天+研究+交通","plan":[{"description":"研究西湖周边自然景点并挑选2个轻松路线","category":"research","priority":"high"},{"description":"制定第1天上午西湖漫步+断桥周边行程","category":"activity","priority":"high"},{"description":"制定第1天下午灵隐寺及飞来峰参观安排","category":"activity","priority":"medium"},{"description":"规划第2天千岛湖或湘湖一日放松行程方案","category":"activity","priority":"medium"},{"description":"规划第3天博物馆与老城区(湖南路/河坊街)慢节奏行程","category":"activity","priority":"medium"},{"description":"列出往返高铁班次与预订窗口","category":"transportation","priority":"high"},{"description":"筛选西湖周边性价比住宿3个备选","category":"accommodation","priority":"high"}]}

示例2:
用户: "帮我生成一个2周日本行程。"
输出: {"thinking":"缺少城市/预算/兴趣，需要补充，同时给初步骨架","direct_answer":"需要补充：主要城市/预算/出发日期/人数。先给你一个骨架计划，可再细化。","plan":[{"description":"列出日本2周常见路线模式(关东+关西+一处自然)供选择","category":"research","priority":"high"},{"description":"建议东京/京都/大阪/奈良/箱根分配大致天数","category":"research","priority":"high"},{"description":"收集用户预算与人数","category":"research","priority":"high"},{"description":"补充出发与返回日期","category":"research","priority":"high"}]}

示例3:
用户: "明天去上海出差，晚上能顺便逛什么?"
输出: {"thinking":"短期+单晚可给几个活动建议+微型计划","plan":[{"description":"搜集上海明晚天气与地铁运营时间","category":"research","priority":"medium"},{"description":"推荐外滩夜景步行线路","category":"activity","priority":"high"},{"description":"推荐南京东路轻松小吃点位2-3个","category":"activity","priority":"medium"}]}

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

export const createPlannerNode = () => {
    const llm = new DeepSeek();
    const model = llm.llm('deepseek-chat');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const system = new SystemMessage({ content: PLANNER_PROMPT });
        const last = state.messages[state.messages.length - 1];
        const resp = await model.invoke([system, ...state.messages]);
        const raw = resp.content?.toString() || '';
        const jsonObj = extractFirstJson(raw) || { plan: [], direct_answer: undefined };

        let parsed: PlanJson;
        try {
            parsed = PLAN_JSON_SCHEMA.parse(jsonObj);
        } catch {
            // 如果解析失败，降级给一个缺省提示
            parsed = { direct_answer: '暂时无法生成结构化计划，请稍后重试。', plan: [] };
        }

        // 确保 plan 非空（若模型没遵守，进行最小自我修复）
        if (!parsed.plan || parsed.plan.length === 0) {
            parsed.plan = [
                {
                    description: '细化用户需求（天数/偏好）后重新生成计划',
                    category: 'research',
                    priority: 'high',
                },
            ];
        }

        return { messages: [new AIMessage({ content: JSON.stringify(parsed) })] };
    };
};
