import { AgentState } from "../state";
import { DynamicStructuredTool } from "@langchain/core/tools";
import {
	AIMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import { get_encoding } from "tiktoken";
import { DeepSeek } from "../models/deepseek";

const encoding = get_encoding("cl100k_base");
const CONTEXT_THRESHOLD = 2000; // Token threshold to trigger summarization

/**
 * The orchestrator is now the central decision-making unit.
 * It first assesses the context length and decides if a summary is needed.
 * Then, it operates on a rolling summary, a structured memory object,
 * and the latest user messages to decide the next action.
 */
export const createOrchestrator = (tools: DynamicStructuredTool[]) => {
	const ds = new DeepSeek();
	const model = ds.llm("deepseek-chat").withConfig({
		tools: tools,
		tool_choice: "auto",
	});

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		console.log("---ORCHESTRATOR---");
		const { messages, memory, summary } = state;

		// 1. Calculate token count from messages and summary
		const tokenCount = encoding.encode(
			summary + JSON.stringify(messages)
		).length;
		console.log(`Orchestrator token count: ${tokenCount}`);

		// 2. If token count exceeds threshold, delegate to summarizer
		if (tokenCount > CONTEXT_THRESHOLD) {
			console.log("Context exceeds threshold, delegating to summarizer.");
			return { next: "summarizer" };
		}

		// 3. Construct the dynamic system prompt
		const systemMessage = new SystemMessage({
			content: `You are a travel intelligence orchestrator Agent. Your goal is to guide the user to provide key information, infer the task's topic, generate a subtask list, and finally integrate the results to provide complete travel advice.

---
## 📜 Conversation Summary (Historical Context)
This is a summary of the conversation so far. Use it to understand the background.
<summary>
${summary}
</summary>

---
## 🗂️ Structured Memory (Confirmed Facts)
This is a JSON object of confirmed facts. This is your source of truth.
<memory>
${JSON.stringify(memory, null, 2)}
</memory>

---
## 🎯 Core Workflow & Decision Making

### 1. Information Gathering
Your primary goal is to fill the \`memory\` with the following required fields:
-   **departure_location**: The starting point of the journey.
-   **destination_location**: The final destination.
-   **departure_date**: The date of departure.
-   **transportation_preference**: (Optional) The user's preferred mode of transport if route planning is involved.

**Decision Flow:**
-   **Analyze**: First, check the \`memory\` and the latest user message to see which fields are missing.
-   **Tool First**: If the user provides ambiguous information (e.g., "tomorrow"), use a tool to resolve it to a concrete value first.
-   **Ask Next**: If information is still missing, ask the user for **one** crucial missing piece of information. Be specific.

### 2. Subtask Creation (When Memory is Complete)
Once all required information is present in \`memory\`:
1.  **Infer Topic**: Deduce a concise trip \`topic\` (e.g., "Weekend trip to Hangzhou for a family").
2.  **Call \`create_subtask\`**: Use the \`create_subtask\` tool to generate TWO subtasks based on the topic and memory.

#### Subtask Definitions:

**A. Transportation Route Task (\`travel_route\`)**
-   **Goal**: Plan the travel route and method from departure to destination.
-   **Example Input for Agent**: "Please plan the transportation from Shanghai to Suzhou, departing on August 2nd."

**B. POI & Restaurant Recommendation Task (\`poi_recommendation\`)**
-   **Goal**: Recommend key points of interest and quality restaurants at the destination.
-   **Example Input for Agent**: "I'm traveling from Shanghai to Suzhou on August 2nd. Please recommend attractions and restaurants."

---
## 💬 Current Conversation (Latest User Messages)
This is the most recent part of the conversation. Focus on the user's latest message to decide your next action based on the workflow above.
`,
		});

		// 4. Invoke the model with the full context
		const result = await model.invoke([systemMessage, ...messages]);
		const aiMessage = result as AIMessage;

		// 5. Decide the next step based on the model's response
		const subtaskToolCall = aiMessage.tool_calls?.find(
			(tc) => tc.name === "create_subtask"
		);

		if (subtaskToolCall) {
			console.log("Orchestrator is creating a subtask.");
			const subtask = subtaskToolCall.args.subtask;
			const toolMessage = new ToolMessage({
				tool_call_id: subtaskToolCall.id ?? "",
				content: "Subtask created and ready for routing.",
			});
			return {
				messages: [aiMessage, toolMessage],
				subtask: subtask,
				next: "router",
			};
		}

		if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
			console.log("Orchestrator is calling a tool.");
			return {
				messages: [aiMessage],
				next: "tools",
			};
		}

		console.log("Orchestrator is asking the user a question.");
		return {
			messages: [aiMessage],
			next: "ask_user",
		};
	};
};
