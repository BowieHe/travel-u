import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMcpTools } from "@/mcp/mcp-tools";
import { getMcpClientManager } from "@/mcp/mcp-client";
import { ToolDefinition } from "@/mcp/types";

// Mock the entire mcp-client module
const mockListTools = vi.fn();
const mockCallTool = vi.fn();
const mockManagerInstance = {
	listTools: mockListTools,
	callTool: mockCallTool,
};

vi.mock("@/mcp/mcp-client", () => ({
	// We don't need to mock initializeMcpClientManager for this test
	initializeMcpClientManager: vi.fn(),
	// The key is to mock getMcpClientManager to return our controlled instance
	getMcpClientManager: vi.fn(() => mockManagerInstance),
}));

describe("createMcpTools", () => {
	beforeEach(() => {
		// Reset mocks before each test to ensure isolation
		vi.clearAllMocks();
	});

	it("should create dynamic tools based on the manager's listTools output", async () => {
		// Arrange: Define the mock tools that the manager will "return"
		const mockToolDefinitions: ToolDefinition[] = [
			{
				name: "time_get_current_time",
				description: "A test tool for getting time",
				inputSchema: {
					type: "object",
					properties: {
						timezone: { type: "string", description: "e.g. 'UTC'" },
					},
					required: ["timezone"],
				},
			},
		];
		mockListTools.mockResolvedValue(mockToolDefinitions);

		// Act: Call the function we are testing
		const { tools: dynamicTools, toolDefs } = await createMcpTools();

		// Assert: Check that the tools were created correctly
		expect(getMcpClientManager).toHaveBeenCalledTimes(1);
		expect(mockListTools).toHaveBeenCalledTimes(1);
		expect(dynamicTools).toHaveLength(1);
		expect(dynamicTools[0].name).toBe("time_get_current_time");
		expect(dynamicTools[0].description).toBe(
			"A test tool for getting time"
		);
		expect(toolDefs["time_get_current_time"]).toEqual(
			mockToolDefinitions[0]
		);
	});

	it("should create a tool that correctly calls the manager's callTool method with JSON string input", async () => {
		// Arrange
		const mockToolDefinitions: ToolDefinition[] = [
			{ name: "test_tool", description: "d", inputSchema: {} },
		];
		mockListTools.mockResolvedValue(mockToolDefinitions);
		mockCallTool.mockResolvedValue({ success: true, result: "done" });

		// Act
		const { tools: dynamicTools } = await createMcpTools();
		const result = await dynamicTools[0].invoke({ arg1: "value1" });

		// Assert
		expect(mockCallTool).toHaveBeenCalledTimes(1);
		expect(mockCallTool).toHaveBeenCalledWith("test_tool", {
			arg1: "value1",
		});
		expect(result).toBe(JSON.stringify({ success: true, result: "done" }));
	});

	it("should return an error message if callTool fails", async () => {
		// Arrange
		const mockToolDefinitions: ToolDefinition[] = [
			{ name: "test_tool", description: "d", inputSchema: {} },
		];
		mockListTools.mockResolvedValue(mockToolDefinitions);
		mockCallTool.mockRejectedValue(new Error("Something went wrong"));

		// Act
		const { tools: dynamicTools } = await createMcpTools();
		const result = await dynamicTools[0].invoke({ arg1: "value1" });

		// Assert
		expect(result).toBe("Error: Something went wrong");
	});

	it("should return an empty array if the manager provides no tools", async () => {
		// Arrange
		mockListTools.mockResolvedValue([]);

		// Act
		const { tools: dynamicTools } = await createMcpTools();

		// Assert
		expect(dynamicTools).toHaveLength(0);
	});
});
