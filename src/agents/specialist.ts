import { Tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DeepSeek } from "../models/deepseek";
import { Runnable } from "@langchain/core/runnables";
import { AgentState } from "../state";
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from "@langchain/core/prompts";

/**
 * Creates a self-contained ReAct agent for a specialist.
 * @param tools The tools the specialist agent will have access to.
 * @param systemMessage A system message to define the specialist's role.
 * @returns A runnable ReAct agent.
 */
export const createSpecialistAgent = (
	tools: Tool[],
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
