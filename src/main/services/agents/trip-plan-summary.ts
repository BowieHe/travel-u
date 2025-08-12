import { z } from 'zod';
import { DeepSeek } from '../models/deepseek';
import { AgentState, TripPlan } from '../utils/agent-type';
import { SystemMessage } from '@langchain/core/messages';
import { parseSchema } from '../utils/tool';

export const tripPlanSchema = z.object({
    destination: z.string().nullable(),
    departure: z.string().nullable(),
    startDate: z.string().nullable(),
    endDate: z.string().nullable(),
    budget: z.number().nullable(),
    travelers: z.number().nullable(),
    preferences: z.array(z.string()).nullable(),
    itinerary: z
        .array(
            z.object({
                day: z.number(),
                date: z.string(),
                activities: z.array(
                    z.object({
                        time: z.string(),
                        title: z.string(),
                        description: z.string(),
                        location: z.string(),
                        cost: z.number().optional(),
                        duration: z.number().optional(),
                        type: z.enum([
                            'sightseeing',
                            'dining',
                            'entertainment',
                            'shopping',
                            'transportation',
                            'other',
                        ]),
                    })
                ),
                transportation: z
                    .object({
                        type: z.enum([
                            'flight',
                            'train',
                            'bus',
                            'car',
                            'taxi',
                            'subway',
                            'walking',
                        ]),
                        from: z.string(),
                        to: z.string(),
                        departureTime: z.string().optional(),
                        arrivalTime: z.string().optional(),
                        cost: z.number().optional(),
                        duration: z.number().optional(),
                        details: z.string().optional(),
                    })
                    .optional(),
                accommodation: z
                    .object({
                        name: z.string(),
                        type: z.enum(['hotel', 'hostel', 'apartment', 'bnb', 'other']),
                        location: z.string(),
                        checkIn: z.string(),
                        checkOut: z.string(),
                        cost: z.number().optional(),
                        rating: z.number().optional(),
                    })
                    .optional(),
            })
        )
        .nullable(),
    transportation: z.string().nullable(),
});

const TRIP_PLAN_SUM = `你是一个专业的旅行计划助手。你的任务是仔细分析提供的对话历史，提取相关信息，并将它们填充到一个结构化的行程计划对象中。你的输出**必须**是一个有效的 JSON 对象，代表 TripPlan。

**TripPlan 对象结构：**

\`\`\`json
{
    "destination": "string" | undefined, // 用户想要去的目的地。
    "departure": "string" | undefined,   // 用户的出发城市。
    "startDate": "string" | undefined, // 旅行的开始日期 (例如: YYYY-MM-DD)。
    "endDate": "string" | undefined,   // 旅行的结束日期 (例如: YYYY-MM-DD)。
    "budget": number | undefined,     // 旅行的总预算。
    "travelers": number | undefined,    // 旅行人数。
    "preferences": string[] | undefined, // 用户的旅行偏好 (例如: "海滩", "冒险", "文化").
    "itinerary": [
        {
            "day": number,
            "date": "string",
            "activities": [
                {
                    "time": "string",
                    "title": "string",
                    "description": "string",
                    "location": "string",
                    "cost": number | undefined,
                    "duration": number | undefined,
                    "type": "sightseeing" | "dining" | "entertainment" | "shopping" | "transportation" | "other"
                }
            ],
            "transportation": {
                "type": "flight" | "train" | "bus" | "car" | "taxi" | "subway" | "walking",
                "from": "string",
                "to": "string",
                "departureTime": "string" | undefined,
                "arrivalTime": "string" | undefined,
                "cost": number | undefined,
                "duration": number | undefined,
                "details": "string" | undefined
            } | undefined,
            "accommodation": {
                "name": "string",
                "type": "hotel" | "hostel" | "apartment" | "bnb" | "other",
                "location": "string",
                "checkIn": "string",
                "checkOut": "string",
                "cost": number | undefined,
                "rating": number | undefined
            } | undefined
        }
    ] | undefined, // 详细的每日行程。
    "transportation": "string" | undefined // 用户明确说明的交通方式 (例如: "飞机", "火车", "汽车")。**除非用户明确说明，否则不要推断。** 如果未说明，请保持 undefined。
}
\`\`\`

**信息提取说明：**

1.  **分析对话历史**：仔细阅读对话中的所有消息。
2.  **填充 TripPlan 对象**：对于 TripPlan 结构中的每个字段，从对话中提取最相关、最具体的信息。
3.  **处理缺失信息**：如果某个字段的信息在对话中找不到，或者无法合理推断，则将该字段保留为 \`undefined\` (在 JSON 中为 \`null\`)。
4.  **优先明确陈述**：对于 \`departure\` 和 \`transportation\` 等字段，优先使用用户明确提供的信息。特别是 \`transportation\`，如果用户没有提及偏好的交通方式，请将其保留为 \`undefined\`，不要尝试推断。
5.  **处理行程细节**：如果用户提供了关于特定日期或活动的详细信息，请将它们结构化到 \`itinerary\` 数组中。
6.  **数据类型**：确保所有提取的值都符合 Schema 中指定的数据类型（例如，\`budget\` 和 \`travelers\` 应为数字，日期应尽可能为 YYYY-MM-DD 格式）。
7.  **输出格式**：你的**整个输出必须**是一个独立的 JSON 对象。

--- 示例 ---

**示例 1：从上海去北京，信息较全**

**用户对话历史（模拟）：**

*   用户: 我想去北京玩，大概下个月中旬出发。
*   助手: 好的，您大概什么时候出发呢？预算有多少?
*   用户: 我想在 10 月 15 号左右出发，大概准备 3000 块的预算。两个人去。
*   助手: 好的，您从哪里出发呢？
*   用户: 从上海出发。我们对长城和故宫很感兴趣。
*   助手: 你们打算怎么去呢？
*   用户: 计划坐高铁去。

**期望输出 JSON:**

\`\`\`json
{
    "destination": "北京",
    "departure": "上海",
    "startDate": "2024-10-15",
    "endDate": null,
    "budget": 3000,
    "travelers": 2,
    "preferences": ["长城", "故宫"],
    "itinerary": [],
    "transportation": "高铁"
}
\`\`\`

**示例 2：去泰国，信息部分缺失**

**用户对话历史（模拟）：**

*   用户: 我想去泰国玩个 7 天。
*   助手: 好的，您是从哪里出发呢？
*   用户: 从广州。
*   助手: 有什么想做的吗？
*   用户: 喜欢海边和吃海鲜。

**期望输出 JSON:**

\`\`\`json
{
    "destination": "泰国",
    "departure": "广州",
    "startDate": null,
    "endDate": null,
    "budget": null,
    "travelers": null,
    "preferences": ["海边", "海鲜"],
    "itinerary": [],
    "transportation": null
}
\`\`\`

**示例 3：只有目的地**

**用户对话历史（模拟）：**

*   用户: 我想去成都。

**期望输出 JSON:**

\`\`\`json
{
    "destination": "成都",
    "departure": null,
    "startDate": null,
    "endDate": null,
    "budget": null,
    "travelers": null,
    "preferences": null,
    "itinerary": null,
    "transportation": null
}
\`\`\`

--- 

现在，请分析下列对话历史，输出 TripPlan JSON`;

export const createTripPlanSummaryNode = () => {
    const llm = new DeepSeek().llm('deepseek-chat');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const system = new SystemMessage({ content: TRIP_PLAN_SUM });
        console.log(
            'Trip Plan Summary last Message:',
            state.messages[state.messages.length - 1].content
        );

        const result = await llm.invoke([system, ...state.messages]);

        const trip = parseSchema<TripPlan>(result.content as string, tripPlanSchema);

        return { tripPlan: trip };
    };
};
