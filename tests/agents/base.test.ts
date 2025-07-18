import { describe, it, expect } from "vitest";
import { RunnableAgent } from "../../src/agents/base";
import type { AgentState } from "../../src/types/state";
import { HumanMessage } from "@langchain/core/messages";

// Create a concrete class for testing the abstract class
class TestAgent extends RunnableAgent {
	public async invoke(state: AgentState): Promise<Partial<AgentState>> {
		return {
			messages: [
				...state.messages,
				new HumanMessage("TestAgent invoked"),
			],
			next: "END",
		};
	}
}

describe("RunnableAgent", () => {
	it("should be extendable and the invoke method should work as expected", async () => {
		const agent = new TestAgent();
		const initialState: AgentState = {
			messages: [new HumanMessage("start")],
			next: "Orchestrator", // Use a valid node name
		};

		const result = await agent.invoke(initialState);

		expect(result.messages).toHaveLength(2);
		expect(result.next).toBe("END");
		// @ts-ignore
		expect(result.messages[1].content).toBe("TestAgent invoked");
	});
});
