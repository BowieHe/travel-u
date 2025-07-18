import { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DeepSeek } from "../models/deepseek";
import { Runnable } from "@langchain/core/runnables";
import { AgentState } from "@/types/type";
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from "@langchain/core/prompts";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

/**
 * Creates a wrapped specialist agent that ensures proper message handling
 */
export function createSafeSpecialistAgent(
	tools: DynamicStructuredTool[],
	systemMessage: string
) {
	const baseAgent = createSpecialistAgent(tools, systemMessage);

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		try {
			console.log(
				`Running specialist with ${state.messages.length} messages`
			);

			// For specialist nodes, we mainly care about:
			// 1. The initial user request/context
			// 2. The current task being processed
			// We don't need the full ReAct conversation history

			// Get the current task info
			const currentTask = state.subtask[state.currentTaskIndex];
			if (!currentTask) {
				throw new Error("No current task found");
			}

			// Create a minimal message context for the specialist
			const contextMessages = state.messages.filter(
				(msg) =>
					// Keep user messages and system messages
					(!(msg instanceof AIMessage) &&
						!(msg instanceof ToolMessage)) ||
					// Keep the final AI message from orchestrator
					(msg instanceof AIMessage &&
						msg.content.toString().includes("task_prompt"))
			);

			console.log(
				`Filtered to ${contextMessages.length} context messages for specialist`
			);

			const result = await baseAgent.invoke({
				...state,
				messages: contextMessages,
			});

			console.log(`Specialist completed, returning result`);
			return result;
		} catch (error: any) {
			console.error("Error in specialist agent:", error);

			// Return error state to prevent graph from crashing
			return {
				errorMessage: `Specialist agent error: ${error.message}`,
				messages: state.messages, // Keep existing messages
			};
		}
	};
}

/**
 * Creates a self-contained ReAct agent for a specialist.
 * @param tools The tools the specialist agent will have access to.
 * @param systemMessage A system message to define the specialist's role.
 * @returns A runnable ReAct agent.
 */
export const createSpecialistAgent = (
	tools: DynamicStructuredTool[],
	systemMessage: string
): Runnable<AgentState, Partial<AgentState>> => {
	const ds = new DeepSeek();
	const llm = ds.llm("deepseek-chat");

	const prompt = ChatPromptTemplate.fromMessages([
		["system", systemMessage],
		new MessagesPlaceholder("messages"),
	]);

	const agent = createReactAgent({
		llm,
		tools,
		prompt,
	});

	return agent;
};
