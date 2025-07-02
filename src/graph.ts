import { END, StateGraph, StateGraphArgs } from "@langchain/langgraph";
import { AgentState } from "./state";
import { Destination } from "./agents/destination";
import { Orchestrator } from "./agents/orchestrator";
import { Transportation } from "./agents/transportation";
import { BaseMessage } from "@langchain/core/messages";

// Explicitly define the channels object with the correct type.
// This helps TypeScript correctly infer the state shape.
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

const workflow = new StateGraph<AgentState>({ channels: graphState })
	.addNode("Orchestrator", new Orchestrator().invoke)
	.addNode("Transportation", new Transportation("transportation_tool").invoke)
	.addNode("Destination", new Destination("destination_tool").invoke);

// Set the entrypoint
workflow.setEntryPoint("Orchestrator");

// Add the conditional edges
workflow.addConditionalEdges(
	"Orchestrator",
	(state: AgentState) => state.next,
	{
		Transportation: "Transportation",
		Destination: "Destination",
		END: END,
	}
);

// Add the normal edges
workflow.addEdge("Transportation", "Orchestrator");
workflow.addEdge("Destination", "Orchestrator");

// Compile the graph
export const graph = workflow.compile();
