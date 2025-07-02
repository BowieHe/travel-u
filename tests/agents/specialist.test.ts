import { describe, it, expect } from "vitest";
import { Specialist } from "../../src/agents/specialist";
import type { AgentState } from "../../src/state";
import { AIMessage, ToolMessage } from "@langchain/core/messages";

describe("Specialist", () => {
	it("should invoke the tool and return a ToolMessage", async () => {
		const toolName = "search_tool";
		const specialist = new Specialist(toolName);
		const initialState: AgentState = {
			messages: [
				new AIMessage({
					content: "",
					tool_calls: [{ name: toolName, args: {}, id: "tool_123" }],
				}),
			],
			next: "Transportation", // Or any valid specialist node
		};

		const result = await specialist.invoke(initialState);

		expect(result.messages).toHaveLength(1);
		const resultMessage = result.messages![0];
		expect(resultMessage).toBeInstanceOf(ToolMessage);
		expect((resultMessage as ToolMessage).tool_call_id).toBe("tool_123");
		expect(result.next).toBe("Orchestrator");
	});
});
