import { describe, it, expect } from "vitest";
import { HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../src/types/state";

describe("AgentState", () => {
	it("should have a messages property that is an array of BaseMessage", () => {
		const state: AgentState = {
			messages: [new HumanMessage("hello")],
			next: "Orchestrator",
		};
		expect(Array.isArray(state.messages)).toBe(true);
		expect(state.messages[0]).toBeInstanceOf(HumanMessage);
	});

	it("should have a next property that can be one of the AgentNode values or 'END'", () => {
		const state1: AgentState = {
			messages: [],
			next: "Orchestrator",
		};
		expect(state1.next).toBe("Orchestrator");

		const state2: AgentState = {
			messages: [],
			next: "Transportation",
		};
		expect(state2.next).toBe("Transportation");

		const state3: AgentState = {
			messages: [],
			next: "Destination",
		};
		expect(state3.next).toBe("Destination");

		const state4: AgentState = {
			messages: [],
			next: "END",
		};
		expect(state4.next).toBe("END");
	});
});
