import { describe, it, expect } from "vitest";
import { Orchestrator } from "../../src/agents/orchestrator";
import type { AgentState } from "../../src/state";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";

describe("Orchestrator", () => {
	it("should generate a tool call for a user request", async () => {
		const orchestrator = new Orchestrator();
		const initialState: AgentState = {
			messages: [new HumanMessage("search for something")],
			next: "Orchestrator",
		};

		const result = await orchestrator.invoke(initialState);

		expect(result.messages).toHaveLength(1);
		const resultMessage = result.messages![0];
		expect(resultMessage).toBeInstanceOf(AIMessage);
		expect((resultMessage as AIMessage).tool_calls).toHaveLength(1);
		// The orchestrator should route to a specialist now
		expect(result.next).toBe("Transportation");
	});

	it("should end the conversation after a tool message", async () => {
		const orchestrator = new Orchestrator();
		const initialState: AgentState = {
			messages: [
				new ToolMessage({
					tool_call_id: "tool_123",
					content: "some observation",
				}),
			],
			next: "Orchestrator",
		};

		const result = await orchestrator.invoke(initialState);

		expect(result.messages).toBeUndefined();
		expect(result.next).toBe("END");
	});
});
