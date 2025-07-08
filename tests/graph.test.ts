import { describe, it, expect, vi } from "vitest";
import { initializeGraph } from "../src/graph";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../src/state";
import * as mcpTools from "../src/mcp/mcp-tools";
import * as orchestratorAgent from "../src/agents/orchestrator";
import * as specialistAgent from "../src/agents/specialist";

// Mock the MCP tools to avoid actual API calls
vi.spyOn(mcpTools, "createMcpTools").mockResolvedValue({
	tools: [],
	toolDefs: {},
});

// Mock the underlying LLM calls to control agent behavior
const mockOrchestratorInvoke = vi.fn();
const mockSpecialistInvoke = vi.fn();

vi.spyOn(orchestratorAgent, "createOrchestrator").mockImplementation(
	() => async (state: AgentState) => mockOrchestratorInvoke(state)
);
vi.spyOn(specialistAgent, "createSpecialistAgent").mockImplementation(
	() =>
		({
			invoke: async (state: AgentState) => mockSpecialistInvoke(state),
		} as any) // Using 'as any' to simplify mock implementation for the test
);

describe("initializeGraph", () => {
	it("should initialize a runnable graph instance", async () => {
		const graph = await initializeGraph();
		expect(graph).toHaveProperty("invoke");
		expect(graph).toHaveProperty("stream");
		expect(graph).toHaveProperty("batch");
	});

	it("should route to the correct specialist based on the subtask topic", async () => {
		const graph = await initializeGraph();

		const subtaskPayload = {
			topic: "transportation",
			destination: "Tokyo",
			departure_date: "2025-10-01",
			origin: "San Francisco",
		};

		// 1. Mock the orchestrator to first collect info, then create a subtask
		mockOrchestratorInvoke.mockResolvedValueOnce({
			messages: [
				new AIMessage({
					content: "",
					tool_calls: [
						{
							name: "create_subtask",
							args: { subtask: subtaskPayload },
							id: "tool-call-id-subtask",
						},
					],
				}),
			],
			subtask: subtaskPayload,
			next: "router",
		});

		// 2. Mock the specialist to respond after being routed to
		mockSpecialistInvoke.mockResolvedValue({
			messages: [new AIMessage("Here are your flight options to Tokyo.")],
			next: "END", // End the turn after the specialist responds
		});

		const initialState = {
			messages: [new HumanMessage("I need a flight to Tokyo")],
			memory: {
				destination: "Tokyo",
				departure_date: "2025-10-01",
				origin: "San Francisco",
			},
			next: "orchestrator",
		};

		// Invoke the graph
		const finalState = await graph.invoke(initialState);

		// Assertions
		// It was routed to the specialist
		expect(finalState.current_specialist).toBe("transportation_specialist");
		// The specialist's message is in the final state
		const lastMessage = finalState.messages[finalState.messages.length - 1];
		expect(lastMessage.content).toBe(
			"Here are your flight options to Tokyo."
		);
		// The graph finished
		expect(finalState.next).toBe("END");
	});
});
