import {
	START,
	END,
	StateGraph,
	StateGraphArgs,
	interrupt,
} from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { AgentState } from "@/state";
import { createOrchestrator } from "@/agents/orchestrator";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import { createMcpTools } from "@/mcp/mcp-tools";
import { createSpecialistAgent } from "@/agents/specialist";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { createSummarizer } from "@/agents/summarizer";

// New Summarizer Agent

// The router function that directs the flow based on the subtask
const router = (state: AgentState) => {
	console.log("---ROUTER---");
	if (state.subtask) {
		console.log(`Routing to: ${state.subtask.topic}`);
		if (state.subtask.topic === "transportation") {
			state.current_specialist = "transportation_specialist";
			return "transportation_specialist";
		}
		if (state.subtask.topic === "destination") {
			state.current_specialist = "destination_specialist";
			return "destination_specialist";
		}
	}
	return "END";
};

// A router that decides whether to call tools or end the current specialist's turn
const specialistDecision = (state: AgentState): "specialist_tools" | "END" => {
	console.log("---SPECIALIST DECISION---");
	const lastMessage = state.messages[state.messages.length - 1];

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
	const { tools: mcpTools } = await createMcpTools();
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
			return JSON.stringify(subtask);
		},
	});

	const orchestratorTools: DynamicStructuredTool[] = [
		...mcpTools["time"],
		createSubtaskTool,
	];
	const orchestratorAgent = createOrchestrator(orchestratorTools);
	const orchestratorToolExecutor = new ToolNode(orchestratorTools);

	const transportTools = [
		...mcpTools["12306-mcp"],
		...mcpTools["variflight"],
	];
	const destinationTools = [...mcpTools["amap-maps"], ...mcpTools["fetch"]];
	const transportationToolExector = new ToolNode(transportTools);
	const destinationToolExecutor = new ToolNode(destinationTools);

	const transportationSpecialist = createSpecialistAgent(
		transportTools,
		"You are a specialist in transportation. Your tools have specific prefixes to indicate their data source. Use tools prefixed with `variflight_` for flight-related queries and tools prefixed with `12306-mcp_` for train-related queries. You MUST select the appropriate tool based on the user's specific request for either flights or trains."
	);
	const destinationSpecialist = createSpecialistAgent(
		destinationTools,
		"You are a specialist in destinations. Your tools have specific prefixes. Use tools prefixed with `amap-maps_` for location searches and geographical queries. Use tools prefixed with `fetch_` for retrieving general information from web pages. Your job is to find interesting places, activities, and create itineraries based on the user's request."
	);

	const graphState: StateGraphArgs<AgentState>["channels"] = {
		messages: {
			value: (x: BaseMessage[], y: BaseMessage[]) => {
				// if (y.length < x.length) {
				// 	return y;
				// }
				return x.concat(y);
			},
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
		summary: {
			value: (_x, y) => y,
			default: () => "",
		},
		current_specialist: {
			value: (x, y) => y ?? x,
			default: () => "END",
		},
	};

	const summarizerAgent = createSummarizer();

	const workflow = new StateGraph<AgentState>({ channels: graphState })
		.addNode("orchestrator", orchestratorAgent)
		.addNode("tools", orchestratorToolExecutor)
		.addNode("transport_tools", transportationToolExector)
		.addNode("destination_tools", destinationToolExecutor)
		.addNode("transportation_specialist", transportationSpecialist)
		.addNode("destination_specialist", destinationSpecialist)
		.addNode("wait_user", interrupt)
		.addNode("summarizer", summarizerAgent);

	// The graph now starts directly at the orchestrator
	workflow.addEdge(START, "orchestrator");
	workflow.addEdge("summarizer", "orchestrator"); // After summarizing, return to the orchestrator
	workflow.addEdge("tools", "orchestrator");

	// The orchestrator's conditional edges now handle all primary routing
	workflow.addConditionalEdges(
		"orchestrator",
		(state: AgentState) => {
			if (state.next === "router") {
				return router(state); // Call the router function to decide the specialist
			}
			return state.next; // Otherwise, follow the 'next' state
		},
		{
			summarizer: "summarizer",
			transportation_specialist: "transportation_specialist",
			destination_specialist: "destination_specialist",
			tools: "tools",
			ask_user: "wait_user",
			END: END,
		}
	);

	// Conditional edges for specialists remain the same
	workflow
		.addConditionalEdges("transportation_specialist", specialistDecision, {
			specialist_tools: "transport_tools",
			END: END,
		})
		.addConditionalEdges("destination_specialist", specialistDecision, {
			specialist_tools: "destination_tools",
			END: END,
		})
		.addConditionalEdges(
			"destination_tools",
			(state: AgentState) => state.current_specialist ?? "END",
			{
				destination_specialist: "destination_specialist",
				END: END,
			}
		)
		.addConditionalEdges(
			"transport_tools",
			(state: AgentState) => state.current_specialist ?? "END",
			{
				transportation_specialist: "transportation_specialist",
				END: END,
			}
		);

	const checkpointer = new MemorySaver();
	const graph = workflow.compile({ checkpointer });
	return graph;
};
