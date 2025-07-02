import { describe, it, expect } from "vitest";
import type { AgentState } from "../src/state";
import { HumanMessage } from "@langchain/core/messages";

describe("AgentState", () => {
	it("should have the correct structure", () => {
		const state: AgentState = {
			messages: [new HumanMessage("Hello")],
			next: "Orchestrator",
		};

		expect(state.messages).toBeInstanceOf(Array);
		expect(typeof state.next).toBe("string");
	});
});
