import { describe, it, expect, vi } from "vitest";
import { runGraph } from "../src/index";

// We don't need to mock the entire graph module anymore.

describe("CLI Application", () => {
    it("runGraph should call the graph's stream method", async () => {
        // 1. Create a mock graph object.
        // The only thing runGraph uses is the .stream() method.
        const mockGraph = {
            // The stream method must be a mock function...
            stream: vi.fn().mockImplementation(async function* () {
                // ...that returns an async iterator so the for-await-of loop doesn't crash.
                // An empty one is fine for this test.
                yield { node: { messages: [], next: "END" } };
            }),
        };

        // 2. Call runGraph with our mock graph.
        // We use 'as any' because our mock object is not a full CompiledGraph.
        await runGraph(mockGraph as any, "test input");

        // 3. Assert that the stream method was called.
        expect(mockGraph.stream).toHaveBeenCalled();
        expect(mockGraph.stream).toHaveBeenCalledWith(
            { messages: [expect.any(Object)] }, // Check if it's called with the correct structure
            { recursionLimit: 100 }
        );
    });
});
