/**
 * @file Dynamically creates LangChain tools from MCP tool definitions.
 *
 * This module is responsible for fetching tool definitions from the McpClientManager
 * and wrapping them in a format that LangGraph can use (DynamicTool).
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { getMcpClientManager } from "./client";
import { ToolDefinition } from "../utils/mcp-type";

/**
 * Fetches tool definitions from the MCP client and creates DynamicStructuredTool instances.
 * @returns A promise that resolves to an array of DynamicStructuredTool instances.
 */
export async function createMcpTools(): Promise<{
    tools: Record<string, DynamicStructuredTool[]>;
    toolDefs: Record<string, ToolDefinition>;
}> {
    const mcpClient = getMcpClientManager();
    const toolDefsArray = await mcpClient.listTools();
    const dynamicTools: Record<string, DynamicStructuredTool[]> = {};
    const toolDefs: Record<string, ToolDefinition> = {};

    for (const toolDef of toolDefsArray) {
        toolDefs[toolDef.name] = toolDef;
        // console.log("get toolDef:", toolDef);
        const tool = new DynamicStructuredTool({
            name: toolDef.name, // Already prefixed with 'clientName__', e.g., "time__get_current_time"
            description: toolDef.description,
            schema: toolDef.inputSchema,
            func: async (args: any) => {
                try {
                    // Pass the full prefixed name to callTool
                    const result = await mcpClient.callTool(toolDef.name, args);
                    // LangChain expects a string return from a tool function.
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

        (dynamicTools[toolDef.mcpName] ??= []).push(tool);
    }

    console.log(
        "Dynamically created MCP tools for MCP:",
        Object.keys(dynamicTools).join(",")
    );
    return { tools: dynamicTools, toolDefs };
}
