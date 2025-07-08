/**
 * @file Dynamically creates LangChain tools from MCP tool definitions.
 *
 * This module is responsible for fetching tool definitions from the McpClientManager
 * and wrapping them in a format that LangGraph can use (DynamicTool).
 */

import { DynamicStructuredTool, Tool } from "@langchain/core/tools";
import { getMcpClientManager } from "./mcp-client";
import { z } from "zod";
import { ToolDefinition } from "./types";

/**
 * Fetches tool definitions from the MCP client and creates DynamicStructuredTool instances.
 * @returns A promise that resolves to an array of DynamicStructuredTool instances.
 */
export async function createMcpTools(): Promise<{
	tools: Tool[];
	toolDefs: Record<string, ToolDefinition>;
}> {
	const mcpClient = getMcpClientManager();
	const toolDefsArray = await mcpClient.listTools();
	const dynamicTools: Tool[] = [];
	const toolDefs: Record<string, ToolDefinition> = {};

	for (const toolDef of toolDefsArray) {
		toolDefs[toolDef.name] = toolDef;
		// console.log("get toolDef:", toolDef);
		const tool = new DynamicStructuredTool({
			name: toolDef.name, // Already prefixed, e.g., "github_create_issue"
			description: toolDef.description,
			schema: toolDef.input_schema,
			func: async (args: any) => {
				try {
					const result = await mcpClient.callTool(toolDef.name, args);
					// LangChain expects a string return from a tool function.
					console.log("get tool call result:", result);
					return typeof result === "string"
						? result
						: JSON.stringify(result);
				} catch (error: any) {
					console.error(
						`Error calling MCP tool ${toolDef.name}:`,
						error
					);
					return `Error: ${error.message}`;
				}
			},
		});

		dynamicTools.push(tool as unknown as Tool);
	}

	console.log(
		"Dynamically created MCP tools:",
		dynamicTools.map((t) => t.name).join(", ")
	);
	return { tools: dynamicTools, toolDefs };
}
