import { START, END, StateGraph } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { AgentState } from '../utils/agent-type';
// import { createOrchestrator } from '../agents/orchestrator';
import { createMcpTools } from '../mcp/tools';

import { TaskType } from '../utils/task-type';
import { createSummarizer } from '../agents/summarizer';
import { FOOD_PROMPT, ROUTER_PROMPT, SPOT_PROMPT } from '../prompts/prompt';
import { createSafeSpecialistAgent } from '../agents/specialist';
import { graphState } from '../state/graph-state';
import { createUserInteractionSubgraph } from './user-interaction/graph';
import { createRouterNode } from '../agents/orchestrator';
import { createDirectAnswerNode } from '../agents/directAnswer';
import { createPlannerNode } from '../agents/planner';

export const initializeGraph = async () => {
    const { tools: mcpTools } = await createMcpTools();

    // 2. Create the orchestrator agent (the ReAct agent executor)
    // const orchestrator = createOrchestrator();
    const userInteractionSubgraph = createUserInteractionSubgraph(
        // mcpTools["time"]
        []
    ); // 已编译子图，可作为节点直接使用
    const summarizer = createSummarizer();

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

    // 条件路由：根据 router 节点在 memory.routing.decision 中的决策跳转
    const routeAfterRouter = (state: AgentState): string => {
        return state.next;
    };

    // 新增一个占位节点（后续可替换为真正的 agent 工作流）
    const agentPlaceholder = async (_state: AgentState): Promise<Partial<AgentState>> => {
        return {
            /* 暂无实现 */
        };
    };

    // 替换占位：直接使用用户交互子图（内部含 interrupt 等逻辑）
    const askUserNode = userInteractionSubgraph; // RunnableGraph 兼容节点调用

    // 构建新图
    const workflow = new StateGraph<AgentState>({ channels: graphState })
        .addNode('router', routerNode)
        .addNode('direct_answer', directNode)
        .addNode('planner', plannerNode)
        // .addNode('orchestrator', orchestrator) // legacy combined node (still available if needed)
        .addNode('ask_user', askUserNode)
        .addNode('agent_placeholder', agentPlaceholder)
        .addEdge(START, 'router')
        .addConditionalEdges('router', (state) => state.next, {
            direct_answer: 'direct_answer',
            planner: 'planner',
            ask_user: 'ask_user',
            agent_placeholder: 'agent_placeholder',
        })
        .addEdge('direct_answer', END)
        .addEdge('planner', END)
        // 用户交互完成后进入 planner（子图完成时会设置 next: 'planner'）
        .addEdge('ask_user', 'planner')
        .addEdge('agent_placeholder', END);
    // .addEdge('planner', 'orchestrator') // 如果想在 planner 后再交由 orchestrator 二次处理，可启用
    // .addEdge('direct_answer', 'orchestrator')
    // .addEdge('orchestrator', END);

    // 如果需要：ask_user 与 agent_placeholder 最终也应回到 orchestrator 或 END（暂不接回以简化）
    // .addEdge('ask_user', 'orchestrator')
    // .addEdge('agent_placeholder', 'orchestrator')

    // 用新图替换返回
    // 6. Compile and return the graph
    const checkpointer = new MemorySaver();
    const graph = workflow.compile({ checkpointer });
    const graphObj = await graph.getGraphAsync();
    const mermaidString = graphObj.drawMermaid();
    console.log('Mermaid Graph Definition (new graph):\n', mermaidString);

    return graph;
};
