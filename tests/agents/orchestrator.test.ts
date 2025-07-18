import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrchestrator } from "../../src/agents/orchestrator";
import { AgentState } from "../../src/types/state";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// Mock the createReactAgent function from @langchain/langgraph/prebuilt
const mockAgentExecutorInvoke = vi.fn();
vi.mock("@langchain/langgraph/prebuilt", () => ({
	createReactAgent: vi.fn().mockImplementation(() => ({
		invoke: mockAgentExecutorInvoke,
	})),
}));

describe("createOrchestrator", () => {
	beforeEach(() => {
		// Clear mock history before each test
		mockAgentExecutorInvoke.mockClear();
	});

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

	const resolveDateTool = new DynamicStructuredTool({
		name: "resolve_date",
		description:
			"Resolves a human-readable date to a machine-readable format.",
		schema: z.object({
			date_string: z
				.string()
				.describe("The human-readable date, e.g., 'tomorrow'"),
		}),
		func: async ({ date_string }) => `{"departure_date": "2025-09-11"}`, // Mocked response
	});

	const tools = [createSubtaskTool, resolveDateTool];
	const orchestratorAgent = createOrchestrator(tools);

	it("should ask a question if memory is incomplete", async () => {
		// Mock the agent executor to return a simple text response
		mockAgentExecutorInvoke.mockResolvedValue({
			messages: [
				new AIMessage({
					content: "Where would you like to go?",
				}),
			],
		});

		const initialState: AgentState = {
			messages: [new HumanMessage("I want to book a trip.")],
			memory: { origin: "New York" }, // Incomplete memory
			next: "orchestrator",
			tripPlan: {},
		};

		const result = await orchestratorAgent(initialState);

		expect(result.next).toBe("ask_user");
		expect(result.messages).toHaveLength(1);
		const lastMessage = result.messages![0] as AIMessage;
		expect(lastMessage.content).toBe("Where would you like to go?");
		expect(lastMessage.tool_calls).toBeUndefined();
	});

	it("should call create_subtask when memory is complete", async () => {
		const subtaskPayload = {
			topic: "transportation",
			destination: "Paris",
			departure_date: "2025-09-10",
			origin: "New York",
		};

		// Mock the agent executor to call the create_subtask tool
		mockAgentExecutorInvoke.mockResolvedValue({
			messages: [
				new AIMessage({
					content: "",
					tool_calls: [
						{
							name: "create_subtask",
							args: { subtask: subtaskPayload },
							id: "tool-call-id-123",
						},
					],
				}),
			],
		});

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
			tripPlan: {},
		};

		const result = await orchestratorAgent(initialState);

		expect(result.next).toBe("router");
		expect(result.subtask).toBeDefined();
		expect(result.subtask).toEqual(subtaskPayload);
		expect(result.messages).toHaveLength(2); // AIMessage + ToolMessage

		const aiMessage = result.messages![0] as AIMessage;
		expect(aiMessage.tool_calls).toHaveLength(1);
		expect(aiMessage.tool_calls![0].name).toBe("create_subtask");

		const toolMessage = result.messages![1] as ToolMessage;
		expect(toolMessage.tool_call_id).toBe("tool-call-id-123");
		expect(toolMessage.content).toBe(
			"Subtask created and ready for routing."
		);
	});

	it("should call a regular tool if more information is needed", async () => {
		// Mock the agent executor to call the resolve_date tool
		mockAgentExecutorInvoke.mockResolvedValue({
			messages: [
				new AIMessage({
					content: "",
					tool_calls: [
						{
							name: "resolve_date",
							args: { date_string: "tomorrow" },
							id: "tool-call-id-456",
						},
					],
				}),
			],
		});

		const initialState: AgentState = {
			messages: [new HumanMessage("I want to go to LA tomorrow.")],
			memory: { destination: "LA" },
			next: "orchestrator",
			tripPlan: {},
		};

		const result = await orchestratorAgent(initialState);

		expect(result.next).toBe("tools");
		expect(result.subtask).toBeUndefined();
		expect(result.messages).toHaveLength(1);

		const aiMessage = result.messages![0] as AIMessage;
		expect(aiMessage.tool_calls).toHaveLength(1);
		expect(aiMessage.tool_calls![0].name).toBe("resolve_date");
		expect(aiMessage.tool_calls![0].args).toEqual({
			date_string: "tomorrow",
		});
	});

	it("should update memory from a tool call result", async () => {
		// This test simulates the state *after* a tool has been called.
		// The orchestrator should update its memory with the tool's output.
		mockAgentExecutorInvoke.mockResolvedValue({
			messages: [
				new AIMessage({
					content:
						"Okay, got the date. Where are you departing from?",
				}),
			],
		});

		const initialState: AgentState = {
			messages: [
				new HumanMessage("I want to go to LA tomorrow."),
				// This AIMessage would have been generated in the previous step
				new AIMessage({
					content: "",
					tool_calls: [
						{
							name: "resolve_date",
							args: { date_string: "tomorrow" },
							id: "tool-call-id-789",
						},
					],
				}),
				// This ToolMessage is the result of the graph executing the tool
				new ToolMessage({
					tool_call_id: "tool-call-id-789",
					content: JSON.stringify({ departure_date: "2025-09-11" }),
				}),
			],
			memory: { destination: "LA" }, // Memory before the update
			next: "orchestrator",
			tripPlan: {},
		};

		await orchestratorAgent(initialState);

		// Verify that the agent executor was called with the updated memory
		const callArgs = mockAgentExecutorInvoke.mock.calls[0][0];
		const systemMessageWithMemory = callArgs.messages[0];
		const memoryInSystemMessage = JSON.parse(
			systemMessageWithMemory.content
		);

		expect(memoryInSystemMessage).toEqual({
			destination: "LA",
			departure_date: "2025-09-11",
		});
	});
});
