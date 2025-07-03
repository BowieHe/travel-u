import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../../src/agents/orchestrator";
import { AgentState } from "../../src/state";
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { DynamicTool } from "@langchain/core/tools";

describe("Orchestrator", () => {
    it("should call a tool and return a ToolMessage", async () => {
        const tool = new DynamicTool({
            name: "test-tool",
            description: "A test tool",
            func: async () => "tool output",
        });
        const toolExecutor = new ToolNode([tool]);

        const orchestrator = new Orchestrator(toolExecutor);

        // Mock the llm
        const mockLlm: any = {
            invoke: vi.fn().mockResolvedValue(
                new AIMessage({
                    content: "",
                    tool_calls: [
                        {
                            name: "test-tool",
                            args: {},
                            id: "tool-call-id",
                        },
                    ],
                })
            ),
        };
        // @ts-ignore
        orchestrator.llm = mockLlm;

        const initialState: AgentState = {
            messages: [new HumanMessage("user input")],
            next: "Orchestrator",
        };

        const result = await orchestrator.invoke(initialState);

        expect(result.messages).toHaveLength(1);
        expect(result.messages![0]).toBeInstanceOf(ToolMessage);
        // @ts-ignore
        expect(result.messages![0].content).toBe("tool output");
        expect(result.next).toBe("Orchestrator");
    });

    it("should end if no tool is called", async () => {
        const toolExecutor = new ToolNode([]);
        const orchestrator = new Orchestrator(toolExecutor);

        // Mock the llm
        const mockLlm: any = {
            invoke: vi.fn().mockResolvedValue(
                new AIMessage({
                    content: "final answer",
                })
            ),
        };
        // @ts-ignore
        orchestrator.llm = mockLlm;

        const initialState: AgentState = {
            messages: [new HumanMessage("user input")],
            next: "Orchestrator",
        };

        const result = await orchestrator.invoke(initialState);

        expect(result.messages).toHaveLength(1);
        expect(result.messages![0]).toBeInstanceOf(AIMessage);
        // @ts-ignore
        expect(result.messages![0].content).toBe("final answer");
        expect(result.next).toBe("END");
    });
});
