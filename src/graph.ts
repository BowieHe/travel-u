import { START, END, StateGraph, StateGraphArgs } from "@langchain/langgraph";
import { AgentState } from "./state";
import { Destination } from "./agents/destination";
import { Orchestrator } from "./agents/orchestrator";
import { Transportation } from "./agents/transportation";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { createMcpTools } from "./mcp/mcp-tools";
import { DynamicTool } from "@langchain/core/tools";

// Helper function to create a simple DynamicTool for the specialist agents
const createSpecialistTool = (name: string, description: string) => {
    return new DynamicTool({
        name,
        description,
        func: async () => `This is the mock output for the ${name} tool.`,
    });
};

export const initializeGraph = async () => {
    // 1. Create tools
    const transportationTool = createSpecialistTool(
        "transportation_tool",
        "A tool for finding transportation options."
    );
    const destinationTool = createSpecialistTool(
        "destination_tool",
        "A tool for finding information about destinations."
    );

    // todo)) tools node can be classified into different groups
    const mcpTools = await createMcpTools();
    const allTools = [transportationTool, destinationTool, ...mcpTools];
    const toolExecutor = new ToolNode(allTools);

    // 2. Define agents
    const orchestrator = new Orchestrator(toolExecutor);
    const transportationAgent = new Transportation(
        transportationTool,
        "Transportation"
    );
    const destinationAgent = new Destination(destinationTool, "Destination");

    // 3. Define the graph state
    const graphState: StateGraphArgs<AgentState>["channels"] = {
        messages: {
            value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
            default: () => [],
        },
        next: {
            value: (x, y) => y,
            default: () => "Orchestrator",
        },
    };

    // 4. Build the graph
    const workflow = new StateGraph<AgentState>({ channels: graphState })
        .addNode("Orchestrator", orchestrator.invoke.bind(orchestrator))
        .addNode(
            "Transportation",
            transportationAgent.invoke.bind(transportationAgent)
        )
        .addNode("Destination", destinationAgent.invoke.bind(destinationAgent));

    // 5. Define the routing logic
    const routeToNext = (state: AgentState) => {
        const { next } = state;
        return next;
    };

    // A new routing function for specialists
    const routeToSpecialist = (state: AgentState) => {
        const lastMessage = state.messages[state.messages.length - 1];
        if (!(lastMessage instanceof AIMessage)) {
            return "END";
        }

        // If there are no tool calls, the specialist is done.
        if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
            return "Orchestrator";
        }

        // Otherwise, the specialist needs to continue.
        return state.next;
    };

    // 6. Add edges
    workflow.addEdge(START, "Orchestrator");
    workflow.addConditionalEdges("Orchestrator", routeToNext, {
        Transportation: "Transportation",
        Destination: "Destination",
        Orchestrator: "Orchestrator",
        END: END,
    });

    workflow.addConditionalEdges("Transportation", routeToSpecialist, {
        Transportation: "Transportation",
        Orchestrator: "Orchestrator",
        END: END,
    });

    workflow.addConditionalEdges("Destination", routeToSpecialist, {
        Destination: "Destination",
        Orchestrator: "Orchestrator",
        END: END,
    });

    // 7. Compile and return the graph
    const graph = workflow.compile();
    return graph;
};
