import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { MCPConfigs } from "@/mcp/types";

// Mock the SDK Client to avoid actual process spawning
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
    const mockClient = {
        connect: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue({
            tools: [
                {
                    name: "get_current_time",
                    description:
                        "Gets the current time in a specific timezone.",
                    input_schema: {
                        type: "object",
                        properties: {
                            timezone: {
                                type: "string",
                                description: "e.g., 'Asia/Shanghai'",
                            },
                        },
                    },
                },
            ],
        }),
        callTool: vi.fn().mockImplementation(({ name, arguments: args }) => {
            if (name === "get_current_time") {
                return Promise.resolve({
                    success: true,
                    result: `Mock time for ${args.timezone} is 10:00 AM`,
                });
            }
            return Promise.reject(new Error(`Tool ${name} not found.`));
        }),
    };
    return {
        Client: vi.fn(() => mockClient),
    };
});

// Mock the transports as they are not needed for these unit tests
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
    StdioClientTransport: vi.fn(),
}));
vi.mock("@modelcontextprotocol/sdk/client/sse.js", () => ({
    SSEClientTransport: vi.fn(),
}));

describe("McpClientManager", () => {
    const testConfig: MCPConfigs = {
        mcpServers: {
            time: {
                type: "stdio",
                command: "uvx",
                args: ["mcp-server-time", "--local-timezone=Asia/Shanghai"],
            },
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules(); // Reset module cache before each test
    });

    it("should throw an error if getMcpClientManager is called before initialization", async () => {
        // Dynamically import the module to get a fresh, un-initialized instance
        const { getMcpClientManager } = await import("@/mcp/mcp-client");
        expect(() => getMcpClientManager()).toThrow(
            "McpClientManager not initialized."
        );
    });

    it("should initialize correctly from a config object", async () => {
        const { initializeMcpClientManager } = await import("@/mcp/mcp-client");
        const manager = await initializeMcpClientManager(testConfig);

        expect(Client).toHaveBeenCalledTimes(1);
        expect(Client).toHaveBeenCalledWith({
            name: "time-client",
            version: "1.0.0",
        });

        const mockSdkClient = (Client as any).mock.results[0].value;
        expect(mockSdkClient.connect).toHaveBeenCalledTimes(1);

        const clients = (manager as any).clients;
        expect(clients.size).toBe(1);
        expect(clients.has("time")).toBe(true);
    });

    it("should list aggregated tools with correct prefixes", async () => {
        const { initializeMcpClientManager } = await import("@/mcp/mcp-client");
        const manager = await initializeMcpClientManager(testConfig);
        const tools = await manager.listTools();

        expect(tools).toHaveLength(1);
        expect(tools[0].name).toBe("time_get_current_time");
        expect(tools[0].description).toContain("Gets the current time");
    });

    it("should throw an error when calling a tool for an unregistered client", async () => {
        const { initializeMcpClientManager, getMcpClientManager } =
            await import("@/mcp/mcp-client");
        await initializeMcpClientManager(testConfig);
        const manager = getMcpClientManager();

        await expect(manager.callTool("nonexistent-tool", {})).rejects.toThrow(
            "No MCP client registered with name: nonexistent"
        );
    });

    it("should return the same instance on subsequent initializations", async () => {
        const { initializeMcpClientManager } = await import("@/mcp/mcp-client");
        const instance1 = await initializeMcpClientManager(testConfig);
        const instance2 = await initializeMcpClientManager(testConfig);

        expect(instance1).toBe(instance2);
        expect(Client).toHaveBeenCalledTimes(1);
    });

    describe("resolveCommandPath integration", () => {
        let resolveCommandPathSpy: any;

        beforeEach(async () => {
            // Mock resolveCommandPath implementation
            const commandUtils = await import("@/utils/command");
            resolveCommandPathSpy = vi.spyOn(commandUtils, "resolveCommandPath");
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it("should successfully resolve command path", async () => {
            // Setup mock to return valid path
            resolveCommandPathSpy.mockReturnValue("/usr/bin/uvx");

            const { initializeMcpClientManager } = await import("@/mcp/mcp-client");
            await expect(initializeMcpClientManager(testConfig)).resolves.toBeTruthy();

            // Verify mock was called with correct argument
            expect(resolveCommandPathSpy).toHaveBeenCalledWith("uvx");
        });

        it("should throw error when command resolution fails", async () => {
            // Setup mock to return null (not found)
            resolveCommandPathSpy.mockReturnValue(null);

            const { initializeMcpClientManager } = await import("@/mcp/mcp-client");
            await expect(initializeMcpClientManager(testConfig)).rejects.toThrow(
                "Failed to resolve path for command: uvx"
            );
        });
    });
});
