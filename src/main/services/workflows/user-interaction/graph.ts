import { StateGraph, START, END, interrupt } from '@langchain/langgraph';
import { graphState } from '../../state/graph-state';
import { AgentState } from '../../utils/agent-type';
import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createTimeDecodeNode } from './node-relative-time';
import { createUserResponse } from './user-response';
import { TripPlan, getMissingField } from '../../tools/trip-plan';
import { createTripPlanSummaryNode } from '../../agents/trip-plan-summary';

// function getMissingField(tripPlan: TripPlan): string[] {
//     const missingFields: string[] = [];
//     if (!tripPlan.destination) missingFields.push('destination');
//     if (!tripPlan.departure) missingFields.push('departure');
//     if (!tripPlan.startDate) missingFields.push('startDate');
//     if (!tripPlan.endDate) missingFields.push('endDate');
//     if (tripPlan.budget === undefined || tripPlan.budget === null) missingFields.push('budget');
//     if (!tripPlan.transportation) missingFields.push('transportation');

//     return missingFields;
// }

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

// 询问用户节点 - 在进入 wait_for_user 前设置中断信息
const askUserNode = (state: AgentState): Partial<AgentState> => {
    console.log('--- 询问用户节点 ---');
    // 若已经有待提问字段列表使用之；否则根据 tripPlan 重新计算
    // let missing = state.interactionMissingFields;
    const tripPlan: TripPlan = state.tripPlan || {};
    const missing = getMissingField(tripPlan);

    if (!missing || !missing.length) {
        console.log('无缺失字段，标记交互完成');
        return { next: 'complete_interaction' };
    }
    // todo)) imporve the ask field logic
    const question = generateQuestionForUser(missing.slice(0, 2), tripPlan);

    const userInput = interrupt({
        request_type: 'user_input_needed',
        message: question,
        current_trip_plan: state.tripPlan,
        missing_fields: state.interactionMissingFields,
    });

    console.log('从 interrupt 收到用户输入:', userInput);
    return {
        messages: [new AIMessage({ content: question }), new HumanMessage({ content: userInput })],
        next: 'process_response',
        // interactionAskedFields: updatedAsked,
    };
};

// 完成节点：将收集到的信息传回主图
const completeInteractionNode = (state: AgentState): Partial<AgentState> => {
    console.log('--- 完成用户交互 ---');
    return { next: 'planner' };
};

export function createUserInteractionSubgraph(tools: DynamicStructuredTool[]) {
    const userResponseNode = createTripPlanSummaryNode();

    const subgraph = new StateGraph<AgentState>({
        channels: graphState,
    })
        .addNode('ask_user', askUserNode)
        .addNode('process_response', userResponseNode)
        .addNode('complete_interaction', completeInteractionNode)

        .addEdge(START, 'ask_user')
        .addConditionalEdges('ask_user', (state) => state.next, {
            process_response: 'process_response',
            complete_interaction: 'complete_interaction',
        })
        .addEdge('process_response', 'ask_user')

        // 完成交互后结束子图
        .addEdge('complete_interaction', END);

    return subgraph.compile();
}
