import { StateGraph, START, END } from '@langchain/langgraph';
import { graphState } from '../../state/graph-state';
import { AgentState } from '../../utils/agent-type';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { createTripPlanSummaryNode } from '../../agents/trip-plan-summary';
import { createUserNode, createWaitForUserNode } from './ask-user';

// 完成节点：将收集到的信息传回主图
const completeInteractionNode = (state: AgentState): Partial<AgentState> => {
    console.log('--- 完成用户交互 ---');
    return { next: 'planner' };
};

export function createUserInteractionSubgraph(tools: DynamicStructuredTool[]) {
    const userResponseNode = createTripPlanSummaryNode();
    const askUserNode = createUserNode();
    const waitUserNode = createWaitForUserNode();

    const subgraph = new StateGraph<AgentState>({
        channels: graphState,
    })
        .addNode('ask_user', askUserNode)
        .addNode('wait_user', waitUserNode)
        .addNode('process_response', userResponseNode)
        .addNode('complete_interaction', completeInteractionNode)

        .addEdge(START, 'ask_user')
        .addConditionalEdges('ask_user', (state) => state.next, {
            wait_user: 'wait_user',
            complete_interaction: 'complete_interaction',
        })
        .addEdge('wait_user', 'process_response')
        .addEdge('process_response', 'ask_user')

        // 完成交互后结束子图
        .addEdge('complete_interaction', END);

    return subgraph.compile();
}
