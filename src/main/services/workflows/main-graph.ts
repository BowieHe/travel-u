import { START, END, StateGraph } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { AgentState } from '../utils/agent-type';
import { createMcpTools } from '../mcp/tools';

import { TaskType } from '../utils/task-type';
import { FOOD_PROMPT, ROUTER_PROMPT, SPOT_PROMPT } from '../prompts/prompt';
import { createSafeSpecialistAgent } from '../agents/specialist';
import { graphState } from '../state/graph-state';
import { createUserInteractionSubgraph } from './user-interaction/graph';
import { createRouterNode } from '../agents/orchestrator';
import { createDirectAnswerNode } from '../agents/direct-answer';
import { createPlannerNode, createWaitForUserApprovalNode } from '../agents/planner';
import { createTripPlanSummaryNode } from '../agents/trip-plan-summary';

export const initializeGraph = async () => {
    const { tools: mcpTools } = await createMcpTools();

    const userInteractionSubgraph = createUserInteractionSubgraph(
        // mcpTools["time"]
        []
    ); // 已编译子图，可作为节点直接使用

    // 3. Create specialist agents and their tool nodes
    // const transportTools = [
    //     ...mcpTools["12306-mcp"],
    //     ...mcpTools["variflight"],

    // ];
    // const destinationTools = [...mcpTools["amap-maps"], ...mcpTools["fetch"]];
    // const foodTools = [...mcpTools["amap-maps"], ...mcpTools["fetch"]];

    const transportationSpecialist = createSafeSpecialistAgent(
        // transportTools,
        [],
        ROUTER_PROMPT
    );

    const destinationSpecialist = createSafeSpecialistAgent(
        // destinationTools,
        [],
        SPOT_PROMPT
    );

    const foodSpecialist = createSafeSpecialistAgent(
        // foodTools,
        [],
        FOOD_PROMPT
    );

    // ============ Legacy simple graph (start -> orchestrator -> end) 注释保留 ============
    // const workflow = new StateGraph<AgentState>({ channels: graphState })
    //     .addNode("orchestrator", orchestrator)
    //     .addEdge(START, "orchestrator")
    //     .addEdge("orchestrator", END);

    // ============ New graph with router node ============
    const routerNode = createRouterNode();
    const directNode = createDirectAnswerNode();
    const plannerNode = createPlannerNode();
    const tripPlanSummaryNode = createTripPlanSummaryNode();

    // 条件路由：根据 router 节点在 memory.routing.decision 中的决策跳转
    const routeAfterRouter = (state: AgentState): string => {
        return state.next;
    };

    // 新增一个占位节点（后续可替换为真正的 agent 工作流）
    const agentPlaceholder = async (_state: AgentState): Promise<Partial<AgentState>> => {

        console.log("Enter agent placeHolder, with state:", JSON.stringify(_state))
        return {
            /* 暂无实现 */
        };
    };

    // 替换占位：直接使用用户交互子图（内部含 interrupt 等逻辑）
    const askUserNode = userInteractionSubgraph; // RunnableGraph 兼容节点调用

    const plannerWaitUserNode = createWaitForUserApprovalNode();

    // 构建新图
    const workflow = new StateGraph<AgentState>({ channels: graphState })
        .addNode('router', routerNode)
        .addNode('direct_answer', directNode)
        .addNode('planner', plannerNode)
        .addNode("planner_wait_user", plannerWaitUserNode)
        // .addNode('orchestrator', orchestrator) // legacy combined node (still available if needed)
        .addNode('ask_subgraph', askUserNode)
        .addNode('trip_plan_summary', tripPlanSummaryNode)
        .addNode('agent_router', agentPlaceholder)
        .addEdge(START, 'router')
        .addConditionalEdges('router', (state) => state.next, {
            direct_answer: 'direct_answer',
            planner: 'planner',
            ask_user: 'trip_plan_summary', // 先进入 trip_plan_summary
            agent_router: 'agent_router',
        })
        .addEdge('direct_answer', END)
        .addEdge('planner', END)
        // trip_plan_summary 完成后进入 ask_user
        .addEdge('trip_plan_summary', 'ask_subgraph')
        // ask_user 完成后进入 planner
        .addEdge('ask_subgraph', 'planner')
        .addEdge('planner', 'planner_wait_user')
        .addConditionalEdges('planner_wait_user', (state) => state.next, {
            agent_router: 'agent_router',
            planner: 'planner',
        })

        .addEdge('agent_router', END);

    // 用新图替换返回
    // 6. Compile and return the graph
    const checkpointer = new MemorySaver();
    const graph = workflow.compile({ checkpointer });
    const graphObj = await graph.getGraphAsync();
    const mermaidString = graphObj.drawMermaid();
    console.log('Mermaid Graph Definition (new graph):\n', mermaidString);

    return graph;
};
