import { END, StateGraph, StateGraphArgs } from "@langchain/langgraph";
import { AgentState } from "./state";
import { Destination } from "./agents/destination";
import { Orchestrator } from "./agents/orchestrator";
import { Transportation } from "./agents/transportation";
import { BaseMessage, AIMessage } from "@langchain/core/messages";
import { ToolExecutor } from "@langchain/langgraph/prebuilt";
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
    const mcpTools = await createMcpTools();
    const allTools = [transportationTool, destinationTool, ...mcpTools];
    const toolExecutor = new ToolExecutor({ tools: allTools });

    // 2. Define agents
    const orchestrator = new Orchestrator(toolExecutor);
    const transportationAgent = new Transportation(transportationTool);
    const destinationAgent = new Destination(destinationTool);

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
        const lastMessage = state.messages[state.messages.length - 1];

        if (!(lastMessage instanceof AIMessage)) {
            return "END"; // Should not happen in a normal flow
        }

        if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
            return "END";
        }

        const toolName = lastMessage.tool_calls[0].name;

        // Check if it's a specialist tool
        if (toolName === transportationTool.name) {
            return "Transportation";
        }
        if (toolName === destinationTool.name) {
            return "Destination";
        }

        // For any other tool (assumed to be an MCP tool), the Orchestrator has already
        // executed it and is waiting for the result. The graph should loop back to the orchestrator.
        // The orchestrator's invoke method should have returned a state with next: "Orchestrator".
        // Let's check the 'next' field in the state to confirm.
        if (state.next === "Orchestrator") {
            return "Orchestrator";
        }

        // If it's a tool call we don't recognize, end the graph.
        return "END";
    };

    // 6. Add edges
    workflow.setEntryPoint("Orchestrator");
    workflow.addConditionalEdges("Orchestrator", routeToNext, {
        Transportation: "Transportation",
        Destination: "Destination",
        Orchestrator: "Orchestrator",
        END: END,
    });
    workflow.addEdge("Transportation", "Orchestrator");
    workflow.addEdge("Destination", "Orchestrator");

    // 7. Compile and return the graph
    const graph = workflow.compile();
    return graph;
};
