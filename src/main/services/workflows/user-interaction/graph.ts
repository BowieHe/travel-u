import { StateGraph, START, END, interrupt } from '@langchain/langgraph';
import { graphState } from '../../state/graph-state';
import { AgentState, TripPlan } from '../../utils/agent-type';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createTimeDecodeNode } from './node-relative-time';
import { createUserResponse } from './user-response';

// Helper functions for TripPlan validation
function isTripPlanComplete(tripPlan: TripPlan): boolean {
    const requiredFields = ['destination', 'departure', 'startDate'];
    return requiredFields.every((field) => {
        const value = (tripPlan as any)[field];
        return (
            value !== undefined &&
            value !== null &&
            (typeof value !== 'string' || value.trim() !== '')
        );
    });
}

function getMissingField(tripPlan: TripPlan): string[] {
    const missingFields: string[] = [];
    if (!tripPlan.destination) missingFields.push('destination');
    if (!tripPlan.departure) missingFields.push('departure');
    if (!tripPlan.startDate) missingFields.push('startDate');
    if (!tripPlan.endDate) missingFields.push('endDate');
    if (tripPlan.budget === undefined || tripPlan.budget === null) missingFields.push('budget');
    if (!tripPlan.transportation) missingFields.push('transportation');

    return missingFields;
}

// const startRouter = (_state: AgentState): 'process_response' | 'ask_user' => {
//     // 进入子图时如果是用户继续回答，直接处理；否则发起提问
//     const last = _state.messages[_state.messages.length - 1];
//     return last && last.getType() === 'human' ? 'process_response' : 'ask_user';
// };

// 生成询问用户的消息
function summarizeCollected(plan: TripPlan): string {
    const parts: string[] = [];
    if (plan.destination) parts.push(`目的地: ${plan.destination}`);
    if (plan.departure) parts.push(`出发地: ${plan.departure}`);
    if (plan.startDate) parts.push(`出发日期: ${plan.startDate}`);
    if (plan.endDate) parts.push(`结束日期: ${plan.endDate}`);
    if (plan.budget !== undefined) parts.push(`预算: ${plan.budget}`);
    if (plan.transportation) parts.push(`交通: ${plan.transportation}`);
    return parts.length ? `已收集信息：${parts.join('，')}。` : '';
}

function generateQuestionForUser(missingRequiredFields: string[], plan: TripPlan): string {
    let followUpMessage = '';
    if (
        missingRequiredFields.includes('destination') &&
        missingRequiredFields.includes('departure') &&
        missingRequiredFields.includes('startDate')
    ) {
        followUpMessage = '请告诉我您想去哪里、从哪里出发，以及大概什么时候出发？';
    } else if (
        missingRequiredFields.includes('destination') &&
        missingRequiredFields.includes('departure')
    ) {
        followUpMessage = '请告诉我您想去哪里，以及从哪里出发？';
    } else if (
        missingRequiredFields.includes('destination') &&
        missingRequiredFields.includes('startDate')
    ) {
        followUpMessage = '您的目的地是哪里，大概什么时候出发？';
    } else if (
        missingRequiredFields.includes('departure') &&
        missingRequiredFields.includes('startDate')
    ) {
        followUpMessage = '您从哪里出发，大概什么时候出发？';
    } else if (missingRequiredFields.includes('destination')) {
        followUpMessage = '您的目的地是哪里？';
    } else if (missingRequiredFields.includes('departure')) {
        followUpMessage = '您从哪里出发？';
    } else if (missingRequiredFields.includes('startDate')) {
        followUpMessage = '大概什么时候出发？';
    } else {
        // 针对其他（较少见）的必填字段组合，列出缺失项
        const fieldToChineseMap: Record<string, string> = {
            destination: '目的地',
            departure: '出发城市',
            startDate: '出发日期',
            endDate: '结束日期',
            budget: '预算',
            transportation: '交通方式',
            travelers: '旅行人数',
            preferences: '旅行偏好',
        };
        const chineseMissing = missingRequiredFields.map((field) => fieldToChineseMap[field]);
        followUpMessage = `我们还需要知道以下信息：${chineseMissing.join('、')}。`;
    }
    const summary = summarizeCollected(plan);
    return summary ? `${summary}\n${followUpMessage}` : followUpMessage;
}

// 询问用户节点
const askUserNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log('--- 询问用户节点 ---');
    // 若已经有待提问字段列表使用之；否则根据 tripPlan 重新计算
    let missing = state.interactionMissingFields;
    if (!missing || missing.length === 0) {
        missing = getMissingField(state.tripPlan || {});
    }
    if (!missing.length) {
        console.log('无缺失字段，标记交互完成');
        return { user_interaction_complete: true };
    }
    const asked = new Set(state.interactionAskedFields || []);
    // 选择下一批（这里一次问 1-2 个，优先顺序）
    const priorityOrder = [
        'destination',
        'departure',
        'startDate',
        'endDate',
        'budget',
        'transportation',
        'travelers',
        'preferences',
    ];
    const sorted = missing.sort((a, b) => priorityOrder.indexOf(a) - priorityOrder.indexOf(b));
    // 单字段追问策略：找第一个未问的
    let target = sorted.find((f) => !asked.has(f));
    if (!target) target = sorted[0];
    const question = generateQuestionForUser([target], state.tripPlan || {});
    const updatedAsked = [...asked, target];
    return {
        interactionMissingFields: missing,
        interactionAskedFields: updatedAsked,
        messages: [new AIMessage({ content: question })],
    };
};

// 等待用户输入节点
const waitForUserNode = async (_state: AgentState): Promise<Partial<AgentState>> => {
    interrupt('user_input_needed');
    // 恢复原行为：清空即时消息，标记等待用户
    return { messages: [], awaiting_user: true };
};

// // 处理用户回复并提取信息节点
// const processUserResponseNode = async (
// 	state: AgentState
// ): Promise<Partial<AgentState>> => {
// 	console.log("--- 处理用户回复 ---");

// 	try {
// 		// 使用 extractAndUpdateTravelPlan 来提取和更新信息
// 		const result = await extractAndUpdateTravelPlan(state);

// 		// 检查是否获得了所有必需信息
// 		const updatedTripPlan = result.tripPlan;
// 		const isComplete = updatedTripPlan
// 			? isTripPlanComplete(updatedTripPlan)
// 			: false;

// 		console.log("提取结果:", {
// 			tripPlan: updatedTripPlan,
// 			isComplete: isComplete,
// 		});

// 		return {
// 			...result,
// 			user_interaction_complete: isComplete,
// 		};
// 	} catch (error: any) {
// 		console.error("处理用户回复时出错:", error);
// 		return {
// 			errorMessage: `处理用户回复失败: ${error.message}`,
// 			user_interaction_complete: false,
// 		};
// 	}
// };

// 路由器：决定是继续询问还是结束
const userInteractionRouter = (state: AgentState): 'ask_user' | 'complete_interaction' => {
    // 如果所有必需字段齐全 或 interactionMissingFields 为空
    const tripPlan = state.tripPlan || {};
    const requiredMissing = getMissingField(tripPlan as TripPlan).filter((f) =>
        ['destination', 'departure', 'startDate'].includes(f)
    );
    if (requiredMissing.length === 0) {
        return 'complete_interaction';
    }
    return 'ask_user';
};

// 新增：将 tripPlan 信息转换为 memory 格式的函数
// 移除本地定义，使用从 @/tools/trip-plan 导入的函数

// 完成节点：将收集到的信息传回主图
const completeInteractionNode = async (state: AgentState): Promise<Partial<AgentState>> => {
    console.log('--- 完成用户交互 ---');
    return { user_interaction_complete: true, next: 'planner' };
};

export function createUserInteractionSubgraph(tools: DynamicStructuredTool[]) {
    const relativeTimeNode = createTimeDecodeNode(tools);
    const userResponseNode = createUserResponse();

    const subgraph = new StateGraph<AgentState>({
        channels: graphState,
    })
        .addNode('ask_user', askUserNode)
        .addNode('wait_for_user', waitForUserNode)
        .addNode('relative_time', relativeTimeNode)
        .addNode('process_response', userResponseNode)
        .addNode('complete_interaction', completeInteractionNode)

        // 开始路由：根据消息类型决定流向
        // .addConditionalEdges(START, startRouter, {
        //     ask_user: 'ask_user',
        //     process_response: 'relative_time',
        // })
        .addEdge(START, 'ask_user')

        // 询问用户 -> 等待输入
        .addEdge('ask_user', 'wait_for_user')

        // 等待输入 -> 时间处理
        .addEdge('wait_for_user', 'relative_time')

        // 时间处理 -> 响应处理
        .addEdge('relative_time', 'process_response')

        // 条件边：根据信息完整性决定是继续询问还是完成交互
        .addConditionalEdges('process_response', userInteractionRouter, {
            ask_user: 'ask_user',
            complete_interaction: 'complete_interaction',
        })

        // 完成交互后结束子图
        .addEdge('complete_interaction', END);

    return subgraph.compile();
}
