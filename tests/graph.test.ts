import { describe, it, expect, vi } from "vitest";
import { initializeGraph } from "../src/graph";
import * as mcpTools from "../src/mcp/mcp-tools";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../src/state";

// Mock the agents and tools
vi.mock("../src/agents/orchestrator", () => {
    return {
        Orchestrator: vi.fn().mockImplementation(() => {
            return {
                invoke: (state: AgentState) => {
                    const lastMessage =
                        state.messages[state.messages.length - 1];
                    if (lastMessage instanceof HumanMessage) {
                        return {
                            messages: [
                                new AIMessage({
                                    content: "Responding to user",
                                    tool_calls: [],
                                }),
                            ],
                            next: "END",
                        };
                    }
                    return { messages: [], next: "END" };
                },
            };
        }),
    };
});
vi.mock("../src/agents/transportation");
vi.mock("../src/agents/destination");

// Mock the createMcpTools function to return an empty array
vi.spyOn(mcpTools, "createMcpTools").mockResolvedValue([]);

describe("initializeGraph", () => {
    it("should initialize a runnable graph instance", async () => {
        const graph = await initializeGraph();
        expect(graph).toHaveProperty("invoke");
        expect(graph).toHaveProperty("stream");
        expect(graph).toHaveProperty("batch");
    });

    it("should run the graph and end successfully", async () => {
        const graph = await initializeGraph();
        const initialState = {
            messages: [new HumanMessage("Hello")],
            next: "Orchestrator",
        };

        const finalState = await graph.invoke(initialState);

        expect(finalState.next).toBe("END");
        expect(finalState.messages.length).toBeGreaterThan(1);
        const lastMessage = finalState.messages[finalState.messages.length - 1];
        expect(lastMessage).toBeInstanceOf(AIMessage);
    });
});
