import { describe, it, expect, vi, beforeEach } from "vitest";
import { initializeGraph } from "../src/graph/graph";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { DeepSeek } from "../src/models/deepseek";
import { initFromConfig } from "../src/mcp/mcp-client";

// Mock the DeepSeek model's invoke method to control LLM responses
const mockLLMInvoke = vi.fn();
vi.mock("../src/models/deepseek", () => {
	return {
		DeepSeek: vi.fn().mockImplementation(() => {
			return {
				llm: () => ({
					bind: () => ({
						invoke: (state: any) => mockLLMInvoke(state),
					}),
				}),
			};
		}),
	};
});

describe("Graph Routing Logic", () => {
	beforeEach(async () => {
		// Reset mocks and initialize the MCP client before each test
		vi.clearAllMocks();
		// Initialize the client manager from the actual config file to ensure
		// that the graph has access to all the necessary tools (like create_subtask).
		await initFromConfig("config", "mcp-servers.json");
	});

	it("should route to the correct specialist based on the subtask topic", async () => {
		const graph = await initializeGraph();

		const subtaskPayload = {
			topic: "transportation",
			destination: "Tokyo",
			departure_date: "2025-10-01",
			origin: "San Francisco",
		};

		// 1. Mock the Orchestrator's LLM call to produce a subtask
		mockLLMInvoke.mockResolvedValueOnce(
			new AIMessage({
				content: "Subtask created.",
				tool_calls: [
					{
						name: "create_subtask",
						args: { subtask: subtaskPayload },
						id: "tool-call-id-orchestrator",
					},
				],
			})
		);

		// 2. Mock the Transportation Specialist's LLM call to give a final answer
		mockLLMInvoke.mockResolvedValueOnce(
			new AIMessage("Here are your flight options to Tokyo.")
		);

		const initialState = {
			messages: [new HumanMessage("I need a flight to Tokyo")],
			memory: {
				// Pre-fill memory to skip the information gathering phase
				destination: "Tokyo",
				departure_date: "2025-10-01",
				origin: "San Francisco",
			},
			next: "orchestrator",
		};

		// Invoke the graph
		const finalState = await graph.invoke(initialState);

		// --- Assertions ---

		// 1. Check that the LLM was called twice (once for orchestrator, once for specialist)
		expect(mockLLMInvoke).toHaveBeenCalledTimes(2);

		// 2. Verify the final message list is correct and complete
		const { messages } = finalState;
		expect(messages).toHaveLength(4); // Human, AI(tool_call), Tool, AI(final_answer)
		expect(messages[0]).toBeInstanceOf(HumanMessage);
		expect(messages[1]).toBeInstanceOf(AIMessage);
		expect((messages[1] as AIMessage).tool_calls).toHaveLength(1);
		expect(messages[2]).toBeInstanceOf(ToolMessage);
		expect((messages[2] as ToolMessage).tool_call_id).toBe(
			"tool-call-id-orchestrator"
		);
		expect(messages[3]).toBeInstanceOf(AIMessage);
		expect(messages[3].content).toBe(
			"Here are your flight options to Tokyo."
		);

		// 3. Confirm the graph routed correctly and finished
		expect(finalState.current_specialist).toBe("transportation");
		expect(finalState.next).toBe("END");
	});
});
