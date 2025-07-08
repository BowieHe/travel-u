import { describe, it, expect, vi } from "vitest";
import { createOrchestrator } from "../../src/agents/orchestrator";
import { AgentState } from "../../src/state";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import * as deepseek from "../../src/models/deepseek";

// Mock the DeepSeek class
const mockInvoke = vi.fn();
vi.mock("../../src/models/deepseek", () => {
	return {
		DeepSeek: vi.fn().mockImplementation(() => {
			return {
				llm: () => ({
					bind: () => ({
						invoke: mockInvoke,
					}),
				}),
			};
		}),
	};
});

describe("createOrchestrator", () => {
	// Define the tools used by the orchestrator, mirroring graph.ts
	const createSubtaskTool = new DynamicStructuredTool({
		name: "create_subtask",
		description:
			"Creates a subtask with the collected information when all fields are present.",
		schema: z.object({
			subtask: z.object({
				topic: z
					.string()
					.describe(
						"The topic of the request, inferred from the user's intent. Should be one of: 'transportation', 'destination'."
					),
				destination: z.string().describe("The final destination."),
				departure_date: z
					.string()
					.describe("The machine-readable departure date."),
				origin: z
					.string()
					.describe("The starting point of the journey."),
			}),
		}),
		func: async ({ subtask }) => JSON.stringify(subtask),
	});

	const tools = [createSubtaskTool];
	const orchestratorAgent = createOrchestrator(tools);

	it("should ask a question if memory is incomplete", async () => {
		// Mock the LLM to return a simple text response
		mockInvoke.mockResolvedValue(
			new AIMessage({
				content: "Where would you like to go?",
			})
		);

		const initialState: AgentState = {
			messages: [new HumanMessage("I want to book a trip.")],
			memory: { origin: "New York" }, // Incomplete memory
			next: "orchestrator",
		};

		const result = await orchestratorAgent(initialState);

		expect(result.next).toBe("ask_user");
		expect(result.messages).toHaveLength(2);
		const lastMessage = result.messages![1] as AIMessage;
		expect(lastMessage.content).toBe("Where would you like to go?");
	});

	it("should call create_subtask with the correct topic when memory is complete", async () => {
		const subtaskPayload = {
			topic: "transportation",
			destination: "Paris",
			departure_date: "2025-09-10",
			origin: "New York",
		};

		// Mock the LLM to call the create_subtask tool
		mockInvoke.mockResolvedValue(
			new AIMessage({
				content: "",
				tool_calls: [
					{
						name: "create_subtask",
						args: { subtask: subtaskPayload },
						id: "tool-call-id-123",
					},
				],
			})
		);

		const initialState: AgentState = {
			messages: [
				new HumanMessage(
					"I want to book a flight to Paris for next month."
				),
			],
			memory: {
				destination: "Paris",
				departure_date: "2025-09-10",
				origin: "New York",
			},
			next: "orchestrator",
		};

		const result = await orchestratorAgent(initialState);

		expect(result.next).toBe("router");
		expect(result.subtask).toBeDefined();
		expect(result.subtask).toEqual(subtaskPayload);
		expect(result.messages).toHaveLength(2);
		const lastMessage = result.messages![1] as AIMessage;
		expect(lastMessage.tool_calls).toHaveLength(1);
		expect(lastMessage.tool_calls![0].name).toBe("create_subtask");
	});

	it("should return AIMessage and ToolMessage pair on create_subtask call", async () => {
		const toolCallId = "tool-call-id-test-12345";
		const subtaskPayload = {
			topic: "destination",
			destination: "Tokyo",
			departure_date: "2025-12-20",
			origin: "San Francisco",
		};

		// Mock the LLM to return a tool call for create_subtask
		mockInvoke.mockResolvedValue(
			new AIMessage({
				content: "",
				tool_calls: [
					{
						name: "create_subtask",
						args: { subtask: subtaskPayload },
						id: toolCallId,
					},
				],
			})
		);

		const initialState: AgentState = {
			messages: [new HumanMessage("I want to go to Tokyo in December.")],
			memory: {
				destination: "Tokyo",
				departure_date: "2025-12-20",
				origin: "San Francisco",
			},
			next: "orchestrator",
		};

		const result = await orchestratorAgent(initialState);

		// Verify the next state and subtask
		expect(result.next).toBe("router");
		expect(result.subtask).toEqual(subtaskPayload);

		// Verify the message history
		expect(result.messages).toHaveLength(3);
		const [humanMessage, aiMessage, toolMessage] = result.messages!;

		// Check the AI Message
		expect(aiMessage).toBeInstanceOf(AIMessage);
		const typedAiMessage = aiMessage as AIMessage;
		expect(typedAiMessage.tool_calls).toHaveLength(1);
		expect(typedAiMessage.tool_calls![0].id).toBe(toolCallId);
		expect(typedAiMessage.tool_calls![0].name).toBe("create_subtask");

		// Check the Tool Message
		expect(toolMessage).toBeInstanceOf(ToolMessage);
		const typedToolMessage = toolMessage as ToolMessage;
		expect(typedToolMessage.tool_call_id).toBe(toolCallId);
		expect(typedToolMessage.content).toBe(
			"Subtask created and ready for routing."
		);
	});
});
