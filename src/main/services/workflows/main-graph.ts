import { START, END, StateGraph } from '@langchain/langgraph';
import { MemorySaver } from '@langchain/langgraph-checkpoint';
import { AgentState } from '../utils/agent-type';
import { createOrchestrator } from '../agents/orchestrator';
import { createMcpTools } from '../mcp/tools';

import { TaskType } from '../utils/task-type';
import { createSummarizer } from '../agents/summarizer';
import { FOOD_PROMPT, ROUTER_PROMPT, SPOT_PROMPT } from '../prompts/prompt';
import { createSafeSpecialistAgent } from '../agents/specialist';
import { graphState } from '../state/graph-state';
import { createUserInteractionSubgraph } from './user-interaction/graph';
import { createRouterNode } from '../agents/orch';
import { createDirectAnswerNode } from '../agents/directAnswer';
import { createPlannerNode } from '../agents/planner';

/**
 * Router for the Orchestrator.
 * Handles tool calls, user interaction requests, and subtask routing.
 */
const orchestratorRouter = (state: AgentState): 'subtask_parser' | 'ask_user' | 'orchestrator' => {
    // Handle error cases
    if (state.errorMessage) {
        console.log('Orchestrator encountered error, continuing');
        return 'orchestrator';
    }

    // Route based on next state
    if (state.next === 'subtask_parser') {
        console.log('Creating subtasks for following tasks');
        return 'subtask_parser';
    } else if (state.next === 'ask_user') {
        console.log('Orchestrator requesting user interaction');
        return 'ask_user';
    } else {
        console.log('Orchestrator continuing conversation');
        return 'orchestrator';
    }
};

const subtaskRouter = (
    state: AgentState
): 'transportation_specialist' | 'destination_specialist' | 'food_specialist' | 'summary' => {
    if (state.next === TaskType.Transportation) {
        return 'transportation_specialist';
    } else if (state.next === TaskType.Attraction) {
        return 'destination_specialist';
    } else if (state.next === TaskType.Food) {
        return 'food_specialist';
    } else {
        console.warn('Finish subtask execution, move to summarizer', state.next);
        return 'summary';
    }
};

export const initializeGraph = async () => {
    const { tools: mcpTools } = await createMcpTools();

    // 2. Create the orchestrator agent (the ReAct agent executor)
    const orchestrator = createOrchestrator();
    const userInteractionSubgraph = createUserInteractionSubgraph(
        // mcpTools["time"]
        []
    ); // 直接调用，无需 await/compile
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
        const decision = state.memory?.routing?.decision || 'planner';
        if (decision === 'direct') return 'direct_answer';
        if (decision === 'planner') return 'planner';
        if (decision === 'missingField') return 'ask_user';
        if (decision === 'agent') return 'agent_placeholder';
        return 'planner';
    };

    // 新增一个占位节点（后续可替换为真正的 agent 工作流）
    const agentPlaceholder = async (_state: AgentState): Promise<Partial<AgentState>> => {
        return {
            /* 暂无实现 */
        };
    };

    // ask_user 占位（如果未启用用户子图则简单占位）
    const askUserPlaceholder = async (_state: AgentState): Promise<Partial<AgentState>> => {
        return {
            /* 用户交互占位 */
        };
    };

    // 构建新图
    const workflow = new StateGraph<AgentState>({ channels: graphState })
        .addNode('router', routerNode)
        .addNode('direct_answer', directNode)
        .addNode('planner', plannerNode)
        // .addNode('orchestrator', orchestrator) // legacy combined node (still available if needed)
        .addNode('ask_user', askUserPlaceholder)
        .addNode('agent_placeholder', agentPlaceholder)
        .addEdge(START, 'router')
        .addConditionalEdges('router', routeAfterRouter, {
            direct_answer: 'direct_answer',
            planner: 'planner',
            ask_user: 'ask_user',
            agent_placeholder: 'agent_placeholder',
        })
        .addEdge('direct_answer', END)
        .addEdge('planner', END)
        .addEdge('ask_user', END)
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
