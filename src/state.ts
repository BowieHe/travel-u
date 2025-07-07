import { BaseMessage } from "@langchain/core/messages";

/**
 * Represents the state of our LangGraph.
 */
export type AgentNode =
    | "Orchestrator"
    | "Transportation"
    | "Destination"
    | "tools";

export interface AgentState {
    messages: Array<BaseMessage>;
    next: AgentNode | "END";
    next_tool: string | null;
}
