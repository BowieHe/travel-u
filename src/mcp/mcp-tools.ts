/**
 * @file Dynamically creates LangChain tools from MCP tool definitions.
 *
 * This module is responsible for fetching tool definitions from the McpClientManager
 * and wrapping them in a format that LangGraph can use (DynamicTool).
 */

import { DynamicTool } from "@langchain/core/tools";
import { McpClientManager } from "./mcp-client";

/**
 * Fetches tool definitions from the MCP client and creates DynamicTool instances.
 * @returns A promise that resolves to an array of DynamicTool instances.
 */
export async function createMcpTools(): Promise<DynamicTool[]> {
    const mcpClient = McpClientManager.getInstance();
    const toolDefs = await mcpClient.listTools();
    const dynamicTools: DynamicTool[] = [];

    for (const toolDef of toolDefs) {
        const tool = new DynamicTool({
            name: toolDef.name,
            description: toolDef.description,
            func: async (inputString: string) => {
                // Since DynamicTool takes a string, we'll assume the input is a JSON string
                // for tools that need structured input. The LLM needs to be prompted to provide this.
                let args = {};
                try {
                    // The model might pass an empty string for tools without arguments.
                    if (
                        inputString &&
                        inputString.trim() !== "{}" &&
                        inputString.trim() !== ""
                    ) {
                        args = JSON.parse(inputString);
                    }
                } catch (e) {
                    // If parsing fails, it might be a simple string argument.
                    // We'll pass it inside a generic 'input' field.
                    // A more robust solution would use DynamicStructuredTool.
                    console.warn(
                        `Could not parse input for ${toolDef.name}, passing as raw string in 'input' field.`
                    );
                    args = { input: inputString };
                }
                const result = await mcpClient.callTool(toolDef.name, args);
                return JSON.stringify(result);
            },
        });

        dynamicTools.push(tool);
    }

    console.log(
        "Dynamically created MCP tools:",
        dynamicTools.map((t) => t.name).join(", ")
    );
    return dynamicTools;
}
