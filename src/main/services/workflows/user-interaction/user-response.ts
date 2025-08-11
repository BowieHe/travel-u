import { AgentState, TripPlan } from '../../utils/agent-type';
import { getTripPlanSchema, getMissingField } from '../../tools/trip-plan';
import { DeepSeek } from '../../models/deepseek';
import { AIMessage, SystemMessage } from '@langchain/core/messages';
import { isTripPlanComplete, mergeTripPlan } from '../../tools/trip-plan';

export const createUserResponse = () => {
    const llm = new DeepSeek();
    const model = llm.llm('deepseek-chat');
    const tripPlanSchema = getTripPlanSchema();
    const structuredLlm = model.withStructuredOutput(tripPlanSchema as any);
    const extractionPrompt = `你是一个专业的旅行信息提取助手。
    
    重要规则：
    1. 只提取用户在本次对话中明确表达的信息
    2. 绝对不要推断、猜测或自动填充任何字段
    3. 如果信息不明确，宁可省略该字段
    4. 特别注意结合AI助手的问题来理解用户的回答
    
    已知信息：
    {trip_plan}
    
    上下文理解规则：
    - 如果AI刚问了包含"目的地"、"去哪"、"到哪"的问题，用户的回答应理解为destination
    - 如果AI刚问了包含"出发地"、"从哪"、"哪里出发"的问题，用户的回答应理解为departure
    - 如果AI刚问了包含"日期"、"时间"、"什么时候"的问题，用户的回答应理解为日期信息
    - 如果AI刚问了包含"预算"、"多少钱"的问题，用户的回答应理解为预算
    
    用户主动表达识别规则：
    - 用户说"我想去XX"、"去XX玩"、"到XX"、"XX旅游" → destination是XX
    - 用户说"从XX出发"、"XX出发" → departure是XX
    - 用户提到具体日期 → startDate或endDate
    - 用户明确说"坐飞机"、"坐火车"、"开车" → transportation
    - 用户明确提到金额数字 → budget
    
    严格提取规则：
    - destination: 目的地城市（必须明确表达）
    - departure: 出发地城市（必须明确表达）
    - startDate: 出发日期（必须明确表达）
    - endDate: 返程日期（必须明确表达）
    - transportation: 交通方式（只有用户明确提到具体交通工具时才填写，禁止推断）
    - budget: 预算金额（只有用户明确提到具体数字时才填写，禁止推断）
    
    特别注意：
    - 绝对不要基于城市距离或常见交通方式推断transportation字段
    - 如果用户没有明确提到交通方式，完全省略transportation字段
    - 如果某个字段的信息不够明确，请完全省略该字段
    
    请仔细分析AI的问题和用户的回答，理解用户在回答什么字段。
    
    JSON Schema:
    ${tripPlanSchema.toString()}`;

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        const currentTravelPlan: TripPlan = state.tripPlan || {};

        try {
            // 过滤消息：只保留 Human、AI 和 System 消息，排除 Tool 相关消息
            const filteredMessages = state.messages.filter((msg) => {
                const messageType = msg.getType();
                return messageType === 'human' || messageType === 'ai';
            });

            const extractedInfo = await structuredLlm.invoke([
                new SystemMessage({
                    content: extractionPrompt.replace(
                        '{trip_plan}',
                        JSON.stringify(currentTravelPlan, null, 2)
                    ),
                }),
                ...filteredMessages.slice(-3), // 只取最近3条非工具消息
            ]);

            console.log('LLM原始提取结果:', extractedInfo);
            console.log('当前已有信息:', currentTravelPlan);

            // 使用工具函数合并 TripPlan
            // 规范化 transportation 以匹配工具枚举 (flight/train/car)
            const normalized = { ...extractedInfo } as any;
            if (
                normalized.transportation &&
                !['flight', 'train', 'car'].includes(normalized.transportation)
            ) {
                delete normalized.transportation;
            }
            const updatedTravelPlan = mergeTripPlan(currentTravelPlan as any, normalized);

            const remaining = getMissingField(updatedTravelPlan as any);
            const isComplete = isTripPlanComplete(updatedTravelPlan);
            console.log('合并后的旅行计划:', updatedTravelPlan, 'remaining:', remaining);
            return {
                tripPlan: updatedTravelPlan,
                user_interaction_complete: isComplete,
                interactionMissingFields: remaining,
            };
        } catch (e) {
            console.error('信息提取或更新失败:', e);
            // 如果提取失败，可以返回原始 state 或添加错误消息
            return {
                tripPlan: currentTravelPlan,
                messages: [
                    // ...state.messages,
                    new AIMessage({
                        content: '抱歉，我未能完全理解您的旅行计划信息，请您再详细说明一下。',
                    }),
                ],
            };
        }
    };
};
