import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState } from "../state";
import { RunnableAgent } from "./base";

import { DynamicTool } from "@langchain/core/tools";

export class Specialist extends RunnableAgent {
    constructor(private tool: DynamicTool) {
        super();
    }

    public async invoke(state: AgentState): Promise<Partial<AgentState>> {
        const lastMessage = state.messages[
            state.messages.length - 1
        ] as AIMessage;

        // Assuming the orchestrator has correctly routed a tool call.
        const toolCall = lastMessage.tool_calls![0];

        if (toolCall.name !== this.tool.name) {
            throw new Error(
                `Tool mismatch: Expected ${this.tool.name}, got ${toolCall.name}`
            );
        }

        // Execute the actual tool
        const toolOutput = await this.tool.invoke(toolCall.args);

        const toolMessage = new ToolMessage({
            tool_call_id: toolCall.id!,
            content: toolOutput,
        });

        return {
            messages: [toolMessage],
            next: "Orchestrator",
        };
    }
}
