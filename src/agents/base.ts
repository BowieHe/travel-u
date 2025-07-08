import { DynamicStructuredTool } from "@langchain/core/tools";
import { Runnable } from "@langchain/core/runnables";
import { AgentState } from "../state";
import { z } from "zod";
import { HumanMessage } from "@langchain/core/messages";

/**
 * Creates a tool from a specialist agent.
 * @param agent The specialist agent to be wrapped as a tool.
 * @param name The name of the tool.
 * @param description A description of what the tool does.
 * @returns A DynamicStructuredTool that can be used by other agents.
 */
export const createAgentAsTool = (
	agent: Runnable<AgentState, Partial<AgentState>>,
	name: string,
	description: string
): DynamicStructuredTool => {
	return new DynamicStructuredTool({
		name,
		description,
		schema: z.object({
			input: z
				.string()
				.describe(
					"The detailed question or task for the specialist agent."
				),
		}),
		func: async ({ input }) => {
			const result = await agent.invoke({
				messages: [new HumanMessage(input)],
				next: "Orchestrator", // Start with the orchestrator
				next_tool: null,
			});
			if (!result.messages || result.messages.length === 0) {
				return "No response from the specialist agent.";
			}
			// The output of the tool is the final message from the specialist agent.
			const finalMessage = result.messages[result.messages.length - 1];
			return finalMessage.content;
		},
	});
};
