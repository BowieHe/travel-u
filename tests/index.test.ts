import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runGraph } from "../src/index";
import { HumanMessage } from "@langchain/core/messages";

// Mock AIMessageChunk-like object
const createAIMessageChunk = (content: string) => ({
    content,
});

describe("runGraph", () => {
    let consoleLogSpy: any;
    let stdoutWriteSpy: any;

    beforeEach(() => {
        // Mock console.log and process.stdout.write before each test
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
        stdoutWriteSpy = vi
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
    });

    afterEach(() => {
        // Restore the original implementations after each test
        vi.restoreAllMocks();
    });

    it("should handle streaming output from Orchestrator by calling process.stdout.write for each chunk", async () => {
        // 1. Mock the graph.stream to yield streaming outputs
        async function* streamGenerator() {
            // This async generator simulates the stream of AIMessageChunk-like objects
            async function* contentStream() {
                yield "Hello, ";
                yield "world!";
                yield " This is a stream.";
            }

            // We create a mock message object that has a `content` property which is the async generator.
            // This simulates the shape of the data that `runGraph` expects for streaming.
            const streamingMessage = {
                content: contentStream(),
            };

            yield {
                Orchestrator: {
                    messages: [streamingMessage],
                },
            };
        }

        const mockGraph = {
            stream: vi.fn().mockReturnValue(streamGenerator()),
        };

        // 2. Call runGraph
        await runGraph(mockGraph as any, "test input");

        // 3. Verify process.stdout.write is called for each chunk
        expect(stdoutWriteSpy).toHaveBeenCalledWith(
            "\n--- Output from node: Orchestrator ---\n"
        );
        expect(stdoutWriteSpy).toHaveBeenCalledWith("Hello, ");
        expect(stdoutWriteSpy).toHaveBeenCalledWith("world!");
        expect(stdoutWriteSpy).toHaveBeenCalledWith(" This is a stream.");
        expect(stdoutWriteSpy).toHaveBeenCalledWith("\n");

        // Verify console.log was not called for the message content itself
        expect(consoleLogSpy).not.toHaveBeenCalledWith(
            expect.stringContaining("Hello, ")
        );
    });

    it("should handle non-streaming output from Orchestrator by calling console.log", async () => {
        // 1. Mock the graph.stream to yield a non-streaming output
        const finalMessage = new HumanMessage({
            content: "This is a final, non-streamed message.",
        });

        async function* streamGenerator() {
            yield {
                Orchestrator: {
                    messages: [finalMessage],
                },
            };
        }

        const mockGraph = {
            stream: vi.fn().mockReturnValue(streamGenerator()),
        };

        // 2. Call runGraph
        await runGraph(mockGraph as any, "test input");

        // 3. Verify console.log is called with the final message
        expect(consoleLogSpy).toHaveBeenCalledWith(
            "\n--- Output from node: Orchestrator ---"
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(finalMessage);

        // Verify process.stdout.write was not called for the content
        expect(stdoutWriteSpy).not.toHaveBeenCalledWith(
            expect.stringContaining("This is a final")
        );
    });

    it("should handle output from a different node by calling console.log", async () => {
        // 1. Mock the graph.stream to yield output from a different node
        const finalMessage = new HumanMessage({
            content: "Content from another node.",
        });

        async function* streamGenerator() {
            yield {
                Specialist: {
                    messages: [finalMessage],
                },
            };
        }

        const mockGraph = {
            stream: vi.fn().mockReturnValue(streamGenerator()),
        };

        // 2. Call runGraph
        await runGraph(mockGraph as any, "test input");

        // 3. Verify console.log is called
        expect(consoleLogSpy).toHaveBeenCalledWith(
            "\n--- Output from node: Specialist ---"
        );
        expect(consoleLogSpy).toHaveBeenCalledWith(finalMessage);
    });
});
