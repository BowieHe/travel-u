import { describe, it, expect, vi } from "vitest";
import { Specialist } from "../../src/agents/specialist";
import { AgentState } from "../../src/state";
import { AIMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicTool } from "@langchain/core/tools";

describe("Specialist", () => {
    it("should invoke the correct tool and return a ToolMessage", async () => {
        const tool = new DynamicTool({
            name: "test-tool",
            description: "A test tool",
            func: async () => "tool output",
        });
        const specialist = new Specialist(tool);

        const initialState: AgentState = {
            messages: [
                new AIMessage({
                    content: "",
                    tool_calls: [
                        {
                            name: "test-tool",
                            args: {},
                            id: "tool-call-id",
                        },
                    ],
                }),
            ],
            next: "Destination", // Or any other valid node
        };

        const result = await specialist.invoke(initialState);

        expect(result.messages).toHaveLength(1);
        expect(result.messages![0]).toBeInstanceOf(ToolMessage);
        // @ts-ignore
        expect(result.messages![0].content).toBe("tool output");
        expect(result.next).toBe("Orchestrator");
    });

    it("should throw an error if the tool name does not match", async () => {
        const tool = new DynamicTool({
            name: "test-tool",
            description: "A test tool",
            func: async () => "tool output",
        });
        const specialist = new Specialist(tool);

        const initialState: AgentState = {
            messages: [
                new AIMessage({
                    content: "",
                    tool_calls: [
                        {
                            name: "wrong-tool",
                            args: {},
                            id: "tool-call-id",
                        },
                    ],
                }),
            ],
            next: "Destination",
        };

        await expect(specialist.invoke(initialState)).rejects.toThrow(
            "Tool mismatch: Expected test-tool, got wrong-tool"
        );
    });
});
