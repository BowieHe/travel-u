import { DeepSeek } from "@/models/deepseek";
import { AgentState } from "@/state";
import { SystemMessage } from "@langchain/core/messages";
import { z } from "zod";

export const createSummarizer = () => {
	const ds = new DeepSeek();
	const model = ds.llm("deepseek-chat");

	const summarizationSchema = z.object({
		summary: z
			.string()
			.describe(
				"A concise summary of the conversation, integrating the previous summary with the new messages."
			),
		memory: z
			//.record(z.any())
			.object({
				出发地: z.string().optional().nullable(),
				目的地: z.string().optional().nullable(),
				出发日期: z.string().optional().nullable(),
				偏好交通工具: z.string().optional().nullable(),
				其余信息: z.string().optional().nullable(),
			})
			.describe(
				"An object containing the most up-to-date and complete key information, merging the old memory with new information from the conversation."
			),
	});

	const summarizerModel = model.withStructuredOutput(summarizationSchema);

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		console.log("---SUMMARIZER---");
		const { messages, memory, summary } = state;

		// Intelligent separation: The last message is the current task, the rest is history.
		const messagesToSummarize = messages.slice(0, -1);
		const latestMessage = messages[messages.length - 1];

		const systemMessage = new SystemMessage(
			`You are an expert conversation summarizer. Your goal is to create a new summary and a new memory object by merging the provided history.
- The previous summary is: "${summary}"
- The existing memory is: ${JSON.stringify(memory)}
- The new messages to incorporate are: ${JSON.stringify(messagesToSummarize)}
- Based on all this information, create a new, comprehensive summary.
- Then, create a new, comprehensive memory object, ensuring you carry over all existing information and only update it with newer information from the messages.`
		);

		const result = await summarizerModel.invoke([systemMessage]);

		// Return only the latest message to keep the context clean for the orchestrator
		return {
			summary: result.summary,
			memory: result.memory,
			messages: [latestMessage],
		};
	};
};
