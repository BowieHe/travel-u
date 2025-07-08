import { START, END, StateGraph, StateGraphArgs } from "@langchain/langgraph";
import { AgentState } from "./state";
import { createOrchestrator } from "./agents/orchestrator";
import { BaseMessage } from "@langchain/core/messages";
import { createMcpTools } from "./mcp/mcp-tools";
import { createSpecialistAgent } from "./agents/specialist";
import { createAgentAsTool } from "./agents/base";

export const initializeGraph = async () => {
	// 1. Create base tools from MCP
	const { tools: mcpTools } = await createMcpTools();

	// 2. Create specialist agents, each with their own tools
	const transportationSpecialist = createSpecialistAgent(
		mcpTools,
		"You are a specialist in transportation. Your job is to find the best flights, trains, and other transport options."
	);
	const destinationSpecialist = createSpecialistAgent(
		mcpTools,
		"You are a specialist in destinations. Your job is to find interesting places, activities, and create itineraries."
	);

	// 3. Wrap specialist agents as tools for the orchestrator
	const transportationTool = createAgentAsTool(
		transportationSpecialist,
		"transportation_specialist",
		"Use this tool for any questions about transportation, flights, or trains."
	);
	const destinationTool = createAgentAsTool(
		destinationSpecialist,
		"destination_specialist",
		"Use this tool for any questions about travel destinations, activities, or itineraries."
	);

	// 4. Create the orchestrator agent with the specialist tools
	const orchestratorAgent = createOrchestrator([
		transportationTool,
		destinationTool,
	]);

	// 5. Define the graph state
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

	// 6. Build the graph
	const workflow = new StateGraph<AgentState>({ channels: graphState })
		.addNode("orchestrator", orchestratorAgent)
		.addEdge(START, "orchestrator")
		.addEdge("orchestrator", END);

	// 7. Compile and return the graph
	const graph = workflow.compile();
	return graph;
};
