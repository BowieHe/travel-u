import { describe, it, expect } from "vitest";
import { McpClientManager } from "../../src/mcp/mcp-client";

describe("McpClientManager", () => {
    it("should return a singleton instance", () => {
        const instance1 = McpClientManager.getInstance();
        const instance2 = McpClientManager.getInstance();
        expect(instance1).toBe(instance2);
    });

    it("should list mock tools", async () => {
        const client = McpClientManager.getInstance();
        const tools = await client.listTools();
        expect(Array.isArray(tools)).toBe(true);
        expect(tools.length).toBeGreaterThan(0);
        expect(tools[0].name).toBe("get_weather");
    });

    it("should call a mock tool", async () => {
        const client = McpClientManager.getInstance();
        const result = await client.callTool("test-tool", { arg1: "value1" });
        expect(result.success).toBe(true);
        expect(result.result).toBe("Successfully called mock tool test-tool.");
    });
});
