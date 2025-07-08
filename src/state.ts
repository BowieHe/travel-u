import { BaseMessage } from "@langchain/core/messages";

/**
 * Represents the state of our LangGraph.
 */
export type AgentNode =
	| "orchestrator"
	| "transportation_specialist"
	| "destination_specialist"
	| "tools"
	| "router"
	| "ask_user";

export interface AgentState {
	messages: Array<BaseMessage>;
	next: AgentNode | "END";
	subtask?: any;
	memory: Record<string, any>;
	current_specialist?:
		| "transportation_specialist"
		| "destination_specialist"
		| "END";
}
