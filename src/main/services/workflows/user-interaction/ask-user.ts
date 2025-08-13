import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import { emptyTripPlan, getMissingField, TripInfo } from '../../tools/trip-plan';
import { AgentState } from '../../utils/agent-type';
import { interrupt } from '@langchain/langgraph';
import { DeepSeek } from '../../models/deepseek';

//todo)) 优化询问逻辑,不是每次都要问到所有的问题
export const USER_ASK_PROMPT = `
你是“旅游规划下一问”生成器。你将收到一个仅包含以下字段的输入（对象或等价的键值数组）：
- destination: 用户明确表达要去的目的地城市
- departure: 出发城市
- startDate: 出发日期（YYYY-MM-DD）
- endDate: 返程日期（YYYY-MM-DD）
- budget: 预算数字（缺省币种按CNY理解，可接受区间如10000-15000）
- travelers: 旅游人数
- preferences: 旅游偏好数组（如：美食、城市风光、自然、博物馆、亲子、购物、夜生活）
- transportation: 交通方式（如：飞机、火车、自驾、巴士）

任务：基于已知字段，输出**两行**中文内容：
第1行为“已知信息总结”，第2行为“下一问”问题句（允许同句合并询问2–3个最重要的缺失点）。

严格要求：
1) **仅输出两行**：  
   - 第1行以“已知：”开头，总结已知字段；**只列出已提供的字段**，保持紧凑。  
   - 第2行为**单句问题**，不要前缀、解释、客套、编号；避免换行与多句。
2) 不重复询问已知信息；在问题中可**自然引用**已知字段（如城市名、日期）。
3) 缺失项较多时，**同句合并询问 2–3 个**，并按以下重要性选择：  
   **出发地/目的地 > 时间（start/end） > 预算/交通方式 > 旅行人数/偏好**。  
   - 并列优先级（如预算与交通）可并列询问。  
   - 若缺失项不足2个，只问1个；超过3个也仅取最重要的2–3个。
4) 目的地模糊（如国家/多城/“欧洲”）时，应在**同一句**优先细化到城市级；可在括号中给出不超过6个词的选项提示。
5) 字数建议：第1行 ≤ 60 字；第2行 ≤ 50 字；并列询问用顿号/斜杠/分号自然分隔，但保持**单句**。
6) 金额与日期格式友好：金额直接用数字；日期用 YYYY-MM-DD 或“X月上旬/某周”等易填格式；若 start/end 同时存在，第1行日期显示为“YYYY-MM-DD~YYYY-MM-DD”；仅有其一时标注“出发：/返程：”。
7) 若全部字段已齐全，第2行改为收尾细化点（如节奏/必去/避雷），仍保持单句。
8) 输出中不得包含任何除上述两行以外的内容；不得输出解释、提示或模板。

第1行（总结）格式建议（仅供参考，可按需省略缺失字段的片段）：
已知：目的地：{destination}；出发地：{departure}；日期：{startDate~endDate 或 出发/返程}；人数：{travelers}；预算：{budget}；偏好：{preferences用斜杠列举}；交通：{transportation}

示例（注意均为两行输出）：
- 输入：{ destination: null }
  输出：
  已知：无
  您想去的具体城市是哪里？
- 输入：{ destination: "大阪", startDate: null, endDate: null }
  输出：
  已知：目的地：大阪
  去大阪计划何时出发与返程（给出大致日期）？
- 输入：{ destination: "法国", departure: "上海" }
  输出：
  已知：出发地：上海；目的地：法国
  您要去法国的哪座城市（巴黎/里昂/尼斯等）？
- 输入：{ destination: "广州", startDate: "2025-10-02", endDate: null, budget: null }
  输出：
  已知：目的地：广州；出发：2025-10-02
  返程日期与人均预算分别是多少？
- 输入：{ destination: "成都", startDate: "2025-09-20", endDate: "2025-09-24", travelers: null, transportation: null }
  输出：
  已知：目的地：成都；日期：2025-09-20~2025-09-24
  同行人数多少，优先选择哪种交通（飞机/火车/自驾）？
- 输入：{ destination: "厦门", travelers: 2 }
  输出：
  已知：目的地：厦门；人数：2
  预计出发与返程日期是哪天（YYYY-MM-DD）？
- 输入：{ destination: "重庆", startDate: "2025-08-30", endDate: "2025-09-02", travelers: 4, budget: null, transportation: null }
  输出：
  已知：目的地：重庆；日期：2025-08-30~2025-09-02；人数：4
  本次人均预算大约多少元，优先选择哪种交通？
- 输入：{ destination: "欧洲", departure: null, startDate: null }
  输出：
  已知：目的地：欧洲
  出发地是哪里，去欧洲具体哪座城市（巴黎/罗马/巴塞罗那等），预计何时出发？
- 输入：{ destination: "东京", departure: "北京", startDate: "2025-11-01", endDate: "2025-11-05", travelers: 2, budget: 8000, preferences: ["城市风光"], transportation: "飞机" }
  输出：
  已知：出发地：北京；目的地：东京；日期：2025-11-01~2025-11-05；人数：2；预算：8000；偏好：城市风光；交通：飞机
  行程节奏偏松还是紧，有必去或避雷点吗？

现在开始：接收输入后，严格按“两行输出”的格式：第一行为已知信息总结，第二行为单句问题（可并列2–3个最重要的缺失点）。
`;

export const createUserNode = () => {
    const model = new DeepSeek().llm('deepseek-chat');

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        console.log('--- 询问用户节点 ---');
        // 若已经有待提问字段列表使用之；否则根据 tripPlan 重新计算
        // let missing = state.interactionMissingFields;
        const tripPlan: TripInfo = state.tripInfo || emptyTripPlan;
        const missing = getMissingField(tripPlan);
        if (!missing || !missing.length) {
            console.log('无缺失字段，标记交互完成');
            return { next: 'complete_interaction' };
        }

        const system = new SystemMessage({ content: USER_ASK_PROMPT });
        const resp = await model.invoke([
            system,
            new HumanMessage({ content: JSON.stringify(tripPlan) }),
        ]);

        const question = resp.content;
        console.log('Get question from ask user node:', question);

        // const userInput = interrupt({
        //     request_type: 'user_input_needed',
        //     message: question,
        // });

        return {
            messages: [
                // new AIMessage({ content: question }), //hide for unnecessary print in langgraph
                // new HumanMessage({ content: userInput }),
                resp,
            ],
            next: 'wait_user',
        };
    };
};

export const createWaitForUserNode = () => {
    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const lastMessage = state.messages[state.messages.length - 1];
        console.log('--- 等待用户输入节点 ---');
        const resumed = interrupt({
            request_type: 'user_input_needed',
            message: lastMessage.content,
        });
        if (typeof resumed === 'string' && resumed.trim()) {
            return {
                messages: [new HumanMessage({ content: resumed.trim() })],
                next: 'process_response',
            };
        }
        // 初次调用：只触发中断，不追加消息
        return { next: 'process_response' };
    };
};
