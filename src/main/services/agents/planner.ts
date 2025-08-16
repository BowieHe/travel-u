import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { DeepSeek } from '../models/deepseek';
import { AgentState } from '../utils/agent-type';
import { Gemini } from '../models/gemini';
import { z } from 'zod';
import { extractAndParseJSON } from '../tools/json-parser';

// Zod schema for task structure
const TaskSchema = z.object({
    description: z.string().describe('具体的任务描述，以动词开头'),
    category: z.enum(['research', 'booking', 'transportation', 'accommodation', 'activity', 'other']).describe('任务分类'),
    priority: z.enum(['high', 'medium', 'low']).describe('任务优先级'),
});

// 直接返回任务数组，不包装在 tasks 字段中
const PlanSchema = z.array(TaskSchema).describe('任务列表数组，至少包含1个任务');

// Prompt for planner mode; generate structured task list
const PLANNER_PROMPT = `你是一个旅行规划助手，当前模式: 规划 (planner)。
用户的需求需要多步骤规划：请输出一个结构化的任务列表。

输出要求：
- 必须返回严格的 JSON 格式，不要使用markdown代码块包装
- 直接输出任务数组，每个任务有 description、category、priority 三个字段
- 任务描述以动词开头，具体、避免含糊（不要写"继续沟通"之类）
- 避免把同一天多个动作混在一条里；拆分
- 不执行，只规划
- 不要添加任何额外的文字说明，只返回JSON数组

分类选项：
- research: 研究调查类任务
- booking: 预订类任务  
- transportation: 交通相关
- accommodation: 住宿相关
- activity: 活动体验类
- other: 其他类型

优先级选项：
- high: 高优先级（必须完成的核心任务）
- medium: 中优先级（重要但可调整的任务）
- low: 低优先级（可选的补充任务）

示例输出格式（注意：直接输出数组，不要markdown代码块包装）：
[
  {
    "description": "研究西湖周边自然景点并挑选2个轻松路线",
    "category": "research",
    "priority": "high"
  },
  {
    "description": "制定第1天上午西湖漫步+断桥周边行程",
    "category": "activity", 
    "priority": "high"
  },
  {
    "description": "筛选西湖周边性价比住宿3个备选",
    "category": "accommodation",
    "priority": "high"
  }
]

现在开始，严格按照JSON数组格式输出，不要添加任何markdown包装：`;

export const createPlannerNode = () => {
    const model = new Gemini().llm('gemini-2.5-pro');
    // const llm = new DeepSeek();
    // const model = llm.llm('deepseek-reasoner');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const system = new SystemMessage({ content: PLANNER_PROMPT });
        const last = state.messages[state.messages.length - 1];
        const resp = await model.invoke([system, ...state.messages]);
        const content = resp.content?.toString() || '';

        console.log('Planner Response:', content);

        // 验证并解析 JSON 输出
        try {
            const validated = extractAndParseJSON<typeof PlanSchema>(content);
            // const parsed = JSON.parse(content);
            // const validated = PlanSchema.parse(parsed);

            console.log("Get output from planner response：", JSON.stringify(validated))

            // 返回验证后的 JSON 字符串
            return { messages: [new AIMessage({ content: JSON.stringify(validated) })] };
        } catch (error) {
            console.error('Planner output validation failed:', error);

            // 如果解析失败，返回错误格式的默认计划
            const fallbackPlan = [
                {
                    description: "重新整理需求信息并制定详细计划",
                    category: "research" as const,
                    priority: "high" as const
                }
            ];

            return { messages: [new AIMessage({ content: JSON.stringify(fallbackPlan) })] };
        }
    };
};
