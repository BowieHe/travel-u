import { DynamicStructuredTool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DeepSeek } from "../models/deepseek";
import { AgentState } from "../state";
import {
	ChatPromptTemplate,
	MessagesPlaceholder,
} from "@langchain/core/prompts";
import { SystemMessage } from "@langchain/core/messages";

/**
 * Creates a self-contained ReAct agent for a specialist.
 * This has been refactored to be state-aware, allowing it to access
 * the shared 'memory' and 'summary' for better contextual understanding.
 * @param tools The tools the specialist agent will have access to.
 * @param systemMessage A system message to define the specialist's role.
 * @returns An async function that acts as a stateful node in the graph.
 */
export const createSpecialistAgent = (
	tools: DynamicStructuredTool[],
	baseSystemMessage: string
) => {
	const ds = new DeepSeek();
	const llm = ds.llm("deepseek-chat");

	// Return a stateful, async function to act as a graph node
	return async (state: AgentState): Promise<Partial<AgentState>> => {
		console.log(`---SPECIALIST INVOKED: ${state.current_specialist}---`);
		const { messages, memory, summary } = state;

		// Dynamically create the prompt with memory and summary injection
		const systemMessage = new SystemMessage({
			content: `${baseSystemMessage}

---
## Shared Context (Provided by Orchestrator):

**Conversation Summary**: ${summary}

**Structured Memory**:
<memory>
${JSON.stringify(memory, null, 2)}
</memory>
---

Your current task is to act on the latest user message based on this shared context.`,
		});

		const prompt = ChatPromptTemplate.fromMessages([
			systemMessage,
			new MessagesPlaceholder("messages"),
		]);

		// Create a new ReAct agent for each invocation to ensure it gets the latest state
		const agent = createReactAgent({
			llm,
			tools,
			prompt,
		});

		const result = await agent.invoke({ messages });

		// CRITICAL: Return the full message history from the agent's execution,
		// along with the unchanged memory and summary, to maintain the chain of thought.
		return {
			messages: result.messages, // Return the complete, updated message list
			memory, // Pass through the original memory
			summary, // Pass through the original summary
		};
	};
};
