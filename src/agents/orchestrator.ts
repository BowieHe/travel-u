import {
	AIMessage,
	BaseMessage,
	HumanMessage,
	ToolMessage,
} from "@langchain/core/messages";
import { AgentState } from "../state";
import { RunnableAgent } from "./base";

export class Orchestrator extends RunnableAgent {
	public async invoke(state: AgentState): Promise<Partial<AgentState>> {
		console.log("---ORCHESTRATOR---");
		const lastMessage = state.messages[state.messages.length - 1];

		// If the last message is a tool message, it means a specialist just finished.
		// We can decide if we need to call another specialist or end.
		// For now, we'll just end.
		if (lastMessage instanceof ToolMessage) {
			return {
				next: "END",
			};
		}

		// Otherwise, it's a user request. Route it to the correct specialist.
		// This is a simplified routing logic, a real implementation should use an LLM.
		if (
			typeof lastMessage.content === "string" &&
			lastMessage.content.includes("交通")
		) {
			return { next: "Transportation" };
		} else if (
			typeof lastMessage.content === "string" &&
			lastMessage.content.includes("目的地")
		) {
			return { next: "Destination" };
		} else {
			return { next: "END" };
		}
	}
}
