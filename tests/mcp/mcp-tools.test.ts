import { describe, it, expect, vi } from "vitest";
import { createMcpTools } from "../../src/mcp/mcp-tools";
import { McpClientManager, ToolDefinition } from "../../src/mcp/mcp-client";

describe("createMcpTools", () => {
    it("should create dynamic tools from MCP definitions", async () => {
        const mockTools: ToolDefinition[] = [
            {
                name: "test-tool",
                description: "A test tool",
                input_schema: {
                    type: "object",
                    properties: {
                        arg1: { type: "string", description: "Argument 1" },
                    },
                    required: ["arg1"],
                },
            },
        ];

        const getInstanceSpy = vi.spyOn(McpClientManager, "getInstance");
        const listToolsSpy = vi.fn().mockResolvedValue(mockTools);
        const callToolSpy = vi.fn().mockResolvedValue({ success: true });

        getInstanceSpy.mockReturnValue({
            listTools: listToolsSpy,
            callTool: callToolSpy,
        } as any);

        const dynamicTools = await createMcpTools();

        expect(dynamicTools).toHaveLength(1);
        expect(dynamicTools[0].name).toBe("test-tool");
        expect(dynamicTools[0].description).toBe("A test tool");

        // Test the tool's function
        await dynamicTools[0].invoke(JSON.stringify({ arg1: "value1" }));
        expect(callToolSpy).toHaveBeenCalledWith("test-tool", {
            arg1: "value1",
        });

        await dynamicTools[0].invoke("just a string");
        expect(callToolSpy).toHaveBeenCalledWith("test-tool", {
            input: "just a string",
        });

        await dynamicTools[0].invoke("");
        expect(callToolSpy).toHaveBeenCalledWith("test-tool", {});

        await dynamicTools[0].invoke("{}");
        expect(callToolSpy).toHaveBeenCalledWith("test-tool", {});

        getInstanceSpy.mockRestore();
    });
});
