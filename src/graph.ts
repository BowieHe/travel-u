import { START, END, StateGraph, StateGraphArgs } from "@langchain/langgraph";
import { AgentState } from "./state";
import { createOrchestrator } from "./agents/orchestrator";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { createMcpTools } from "./mcp/mcp-tools";
import { createSpecialistAgent } from "./agents/specialist";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool, Tool } from "@langchain/core/tools";
import { z } from "zod";

// The router function that directs the flow based on the subtask
const router = (state: AgentState) => {
	console.log("---ROUTER---");
	if (state.subtask) {
		console.log(`Routing to: ${state.subtask.topic}`);
		if (state.subtask.topic === "transportation") {
			// Set the current specialist before routing
			state.current_specialist = "transportation_specialist";
			return "transportation_specialist";
		}
		if (state.subtask.topic === "destination") {
			// Set the current specialist before routing
			state.current_specialist = "destination_specialist";
			return "destination_specialist";
		}
	}
	// Default fallback
	return "END";
};

// A router that decides whether to call tools or end the current specialist's turn
const specialistDecision = (state: AgentState): "specialist_tools" | "END" => {
	console.log("---SPECIALIST DECISION---");
	const lastMessage = state.messages[state.messages.length - 1];

	// Check if the last message is an AIMessage and has tool calls
	if (
		lastMessage instanceof AIMessage &&
		lastMessage.tool_calls &&
		lastMessage.tool_calls.length > 0
	) {
		console.log("Decision: call specialist tools.");
		return "specialist_tools";
	}

	console.log("Decision: END specialist turn.");
	return "END";
};

export const initializeGraph = async () => {
	// 1. Define the tools for the orchestrator
	const resolveDateTool = new DynamicStructuredTool({
		name: "resolve_date",
		description:
			"Resolves a natural language date into a machine-readable format.",
		schema: z.object({
			date: z
				.string()
				.describe(
					"The natural language date, e.g., 'tomorrow' or 'next Friday'"
				),
		}),
		func: async ({ date }) => {
			// In a real app, this would use a date parsing library
			console.log(`Simulating date resolution for: ${date}`);
			return JSON.stringify({ date: "2025-08-08" }); // Return a fixed date for simplicity
		},
	});

	// 2. Define the tools for the orchestrator
	const createSubtaskTool = new DynamicStructuredTool({
		name: "create_subtask",
		description:
			"Creates a subtask with the collected information when all fields are present.",
		schema: z.object({
			subtask: z.object({
				topic: z
					.string()
					.describe(
						"The topic of the request, inferred from the user's intent. Should be one of: 'transportation', 'destination'."
					),
				destination: z.string().describe("The final destination."),
				departure_date: z
					.string()
					.describe("The machine-readable departure date."),
				origin: z
					.string()
					.describe("The starting point of the journey."),
			}),
		}),
		func: async ({ subtask }) => {
			// The tool's function is just to return the structured data.
			return JSON.stringify(subtask);
		},
	});

	// 3. Create the orchestrator with its tools
	const orchestratorTools: DynamicStructuredTool[] = [
		resolveDateTool,
		createSubtaskTool,
	];
	const orchestratorAgent = createOrchestrator(orchestratorTools);
	const orchestratorToolExecutor = new ToolNode(orchestratorTools);

	// 4. Create specialist agents and their tools
	const { tools: mcpTools } = await createMcpTools();
	const specialistToolExecutor = new ToolNode(mcpTools);
	const transportationSpecialist = createSpecialistAgent(
		mcpTools,
		"You are a specialist in transportation. Your job is to find the best flights, trains, and other transport options based on the user's request."
	);
	const destinationSpecialist = createSpecialistAgent(
		mcpTools,
		"You are a specialist in destinations. Your job is to find interesting places, activities, and create itineraries based on the user's request."
	);

	// 5. Define the graph state, including the new 'memory' field
	const graphState: StateGraphArgs<AgentState>["channels"] = {
		messages: {
			value: (x: BaseMessage[], y: BaseMessage[]) => x.concat(y),
			default: () => [],
		},
		next: {
			value: (_x, y) => y,
			default: () => "orchestrator",
		},
		subtask: {
			value: (_x, y) => y,
			default: () => undefined,
		},
		memory: {
			value: (x, y) => ({ ...x, ...y }),
			default: () => ({}),
		},
		current_specialist: {
			value: (x, y) => y ?? x,
			default: () => "END",
		},
	};

	// 6. Build the graph with the new architecture
	const workflow = new StateGraph<AgentState>({ channels: graphState })
		.addNode("orchestrator", orchestratorAgent)
		.addNode("tools", orchestratorToolExecutor) // Orchestrator's tools
		.addNode("specialist_tools", specialistToolExecutor) // Specialists' tools
		.addNode("transportation_specialist", transportationSpecialist)
		.addNode("destination_specialist", destinationSpecialist)
		.addNode("router", () => ({}))

		.addEdge(START, "orchestrator")

		.addConditionalEdges(
			"orchestrator",
			(state: AgentState) => state.next,
			{
				router: "router",
				tools: "tools",
				ask_user: END,
			}
		)

		.addConditionalEdges("router", router, {
			transportation_specialist: "transportation_specialist",
			destination_specialist: "destination_specialist",
			END: END,
		})

		.addEdge("tools", "orchestrator") // Loop back to the orchestrator after tool execution

		// Conditional edges for specialists to decide on tool use
		.addConditionalEdges("transportation_specialist", specialistDecision, {
			specialist_tools: "specialist_tools",
			END: END,
		})
		.addConditionalEdges("destination_specialist", specialistDecision, {
			specialist_tools: "specialist_tools",
			END: END,
		})

		// After the specialist tools are called, route back to the correct specialist
		.addConditionalEdges(
			"specialist_tools",
			(state: AgentState) => state.current_specialist ?? "END",
			{
				transportation_specialist: "transportation_specialist",
				destination_specialist: "destination_specialist",
				END: END,
			}
		);

	// 7. Compile and return the graph
	const graph = workflow.compile();
	return graph;
};
