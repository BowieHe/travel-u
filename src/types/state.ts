import { StateGraphArgs } from "@langchain/langgraph";
import { AgentState, UserInteractionState } from "./type";
import { BaseMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
// import { TripPlan } from "@/tools/trip-plan";

export const graphState: StateGraphArgs<AgentState>["channels"] = {
	messages: {
		value: (x: BaseMessage[], y: BaseMessage[]) => {
			// // 更安全的消息合并逻辑
			// if (!x || x.length === 0) return y;
			// if (!y || y.length === 0) return x;

			// // 首先处理ReAct节点的消息
			// const processedMessages = processReActMessages(x, y);

			// // 然后去重
			// const deduplicated = deduplicateMessages(processedMessages);

			// // 最后验证消息序列
			// const validatedMessages = validateMessageSequence(deduplicated);

			// console.log(
			// 	`Message processing: ${x.length} + ${y.length} -> ${processedMessages.length} -> ${deduplicated.length} -> ${validatedMessages.length}`
			// );

			// return validatedMessages;
			return [...x, ...y];
		},
		default: () => [],
	},
	next: {
		value: (_x, y) => y,
		default: () => "orchestrator",
	},
	subtask: {
		value: (_x, y) => y,
		default: () => [],
	},
	currentTaskIndex: {
		value: (_x, y) => y,
		default: () => -1,
	},
	memory: {
		value: (x, y) => ({ ...x, ...y }),
		default: () => ({}),
	},
	currentSpecialist: {
		value: (x, y) => y ?? x,
		default: () => undefined,
	},
	errorMessage: {
		value: (_x, y) => y, // 直接用新值替换
		default: () => undefined,
	},
	// 添加与子图交互的字段
	userInteractionState: {
		value: (x?: UserInteractionState, y?: UserInteractionState) => y ?? x,
		default: () => undefined,
	},
	tripPlan: {
		value: (x, y) => y,
		default: () => ({}),
	},
	user_interaction_complete: {
		value: (_x, y) => y,
		default: () => true,
	},
};

/**
 * Validates that the message sequence is correct for OpenAI API.
 * Ensures that every tool message is preceded by an AI message with tool_calls.
 */
export function validateMessageSequence(
	messages: BaseMessage[]
): BaseMessage[] {
	if (!messages || messages.length === 0) return messages;

	const validatedMessages: BaseMessage[] = [];

	console.log(`Validating message sequence of ${messages.length} messages`);

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];

		if (message instanceof ToolMessage) {
			// Check if the previous message is an AI message with tool_calls
			const prevMessage = validatedMessages[validatedMessages.length - 1];
			if (
				!(prevMessage instanceof AIMessage) ||
				!prevMessage.tool_calls ||
				prevMessage.tool_calls.length === 0
			) {
				// Skip this tool message as it doesn't have a valid preceding AI message
				console.warn(
					`Skipping orphaned tool message: ${message.name} (id: ${message.id})`
				);
				console.warn(
					`Previous message type: ${
						prevMessage?.constructor.name
					}, tool_calls: ${
						prevMessage instanceof AIMessage
							? prevMessage.tool_calls?.length
							: "N/A"
					}`
				);
				continue;
			}

			// Check if this tool message corresponds to a tool call in the previous AI message
			const correspondingToolCall = prevMessage.tool_calls.find(
				(tc) => tc.id === message.tool_call_id
			);

			if (!correspondingToolCall) {
				console.warn(
					`Skipping tool message with unmatched tool_call_id: ${message.tool_call_id}`
				);
				console.warn(
					`Available tool_call_ids: ${prevMessage.tool_calls
						.map((tc) => tc.id)
						.join(", ")}`
				);
				continue;
			}
		}

		validatedMessages.push(message);
	}

	console.log(
		`Validated ${validatedMessages.length} messages (filtered ${
			messages.length - validatedMessages.length
		})`
	);
	return validatedMessages;
}

/**
 * Processes messages from ReAct nodes by keeping only input and final output
 * This helps avoid the issue of intermediate tool calls and responses
 */
function processReActMessages(
	existingMessages: BaseMessage[],
	newMessages: BaseMessage[]
): BaseMessage[] {
	if (!existingMessages || existingMessages.length === 0) return newMessages;
	if (!newMessages || newMessages.length === 0) return existingMessages;

	// For ReAct nodes, we want to keep:
	// 1. All messages up to the point where ReAct started
	// 2. Only the final AI message from ReAct (skip intermediate tool calls)

	// Find the last user or system message in existing messages
	let lastNonReactIndex = existingMessages.length - 1;
	for (let i = existingMessages.length - 1; i >= 0; i--) {
		const msg = existingMessages[i];
		if (!(msg instanceof AIMessage) && !(msg instanceof ToolMessage)) {
			lastNonReactIndex = i;
			break;
		}
	}

	// Keep messages up to the last non-ReAct message
	const baseMessages = existingMessages.slice(0, lastNonReactIndex + 1);

	// From new messages, only keep the final AI message (skip intermediate tool calls)
	const finalAIMessage = newMessages
		.filter((msg) => msg instanceof AIMessage)
		.pop(); // Get the last AI message

	if (finalAIMessage) {
		return [...baseMessages, finalAIMessage];
	}

	// Fallback to original logic if no final AI message found
	return [...existingMessages, ...newMessages];
}

/**
 * Safe message deduplication using multiple strategies
 */
function deduplicateMessages(messages: BaseMessage[]): BaseMessage[] {
	const seen = new Set<string>();
	const result: BaseMessage[] = [];

	for (const message of messages) {
		// Create a unique key based on multiple properties
		const key = `${message.constructor.name}-${message.id || "no-id"}-${
			typeof message.content === "string"
				? message.content.substring(0, 100)
				: JSON.stringify(message.content).substring(0, 100)
		}`;

		if (!seen.has(key)) {
			seen.add(key);
			result.push(message);
		}
	}

	return result;
}
