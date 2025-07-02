import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState } from "../state";
import { RunnableAgent } from "./base";

export class Specialist extends RunnableAgent {
	constructor(private toolName: string) {
		super();
	}

	public async invoke(state: AgentState): Promise<Partial<AgentState>> {
		const lastMessage = state.messages[
			state.messages.length - 1
		] as AIMessage;
		// Here you would actually execute the tool
		const toolOutput = {
			observation: `This is the observation from the ${this.toolName} tool.`,
		};
		const toolMessage = new ToolMessage({
			tool_call_id: lastMessage.tool_calls![0].id!,
			content: JSON.stringify(toolOutput),
		});

		return {
			messages: [toolMessage],
			next: "Orchestrator",
		};
	}
}
