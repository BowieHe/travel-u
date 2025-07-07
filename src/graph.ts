import { START, END, StateGraph, StateGraphArgs } from "@langchain/langgraph";
import { AgentState } from "./state";
import { createOrchestrator } from "./agents/orchestrator";
import { createParserAgent } from "./agents/parser";
import { BaseMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { createMcpTools } from "./mcp/mcp-tools";
import { Tool } from "@langchain/core/tools";

export const initializeGraph = async () => {
    // 1. Create tools
    const { tools: mcpTools, toolDefs: mcpToolDefs } = await createMcpTools();
    const toolNode = new ToolNode(mcpTools);

    // 2. Define agents
    const orchestratorAgent = createOrchestrator(mcpTools);
    const orchestrator = async (state: AgentState) => {
        console.log("\n--- EXECUTING ORCHESTRATOR ---");
        return orchestratorAgent.invoke(state);
    };

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
        next_tool: {
            value: (x, y) => y,
            default: () => null,
        },
    };

    // 4. Build the graph
    const workflow = new StateGraph<AgentState>({ channels: graphState })
        .addNode("orchestrator", orchestrator)
        .addNode("tool_node", async (state: AgentState) => {
            console.log("\n--- EXECUTING TOOL_NODE ---");
            return toolNode.invoke(state);
        })
        .addNode("parser", async (state: AgentState) => {
            console.log("\n--- EXECUTING PARSER ---");
            const toolName = state.next_tool;
            if (!toolName) {
                throw new Error("Parser node called without a tool to parse.");
            }

            const mcpToolDef = mcpToolDefs[toolName];
            if (!mcpToolDef) {
                throw new Error(`Tool definition for ${toolName} not found.`);
            }

            const parserAgent = createParserAgent(
                toolName,
                mcpToolDef.description,
                mcpToolDef.input_schema
            );

            return parserAgent.invoke(state);
        });

    // 5. Define the routing logic
    const router = (state: AgentState) => {
        if (state.next_tool) {
            return "parser";
        }
        return "END";
    };

    // 6. Add edges
    workflow.addEdge(START, "orchestrator");
    workflow.addConditionalEdges("orchestrator", router);
    workflow.addEdge("parser", "tool_node");
    workflow.addEdge("tool_node", "orchestrator");

    // 7. Compile and return the graph
    const graph = workflow.compile();
    return graph;
};
