/**
 * @file Dynamically creates LangChain tools from MCP tool definitions.
 *
 * This module is responsible for fetching tool definitions from the McpClientManager
 * and wrapping them in a format that LangGraph can use (DynamicTool).
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { getMcpClientManager } from "./mcp-client";
import { z } from "zod";

/**
 * Converts a JSON Schema object to a Zod schema.
 * This is a simplified implementation.
 * @param schema The JSON schema for the tool's input.
 * @returns A Zod schema.
 */
function jsonSchemaToZod(schema: any): z.ZodType<any, any> {
    if (
        typeof schema !== "object" ||
        schema === null ||
        schema.type !== "object" ||
        !schema.properties
    ) {
        return z.object({});
    }

    const shape: { [key: string]: z.ZodType<any, any> } = {};
    const requiredFields = new Set(schema.required || []);

    for (const key in schema.properties) {
        const prop = schema.properties[key];
        let fieldSchema: z.ZodType<any, any>;

        switch (prop.type) {
            case "string":
                fieldSchema = z.string().describe(prop.description || "");
                break;
            case "number":
                fieldSchema = z.number().describe(prop.description || "");
                break;
            case "boolean":
                fieldSchema = z.boolean().describe(prop.description || "");
                break;
            default:
                fieldSchema = z.any();
        }

        if (!requiredFields.has(key)) {
            fieldSchema = fieldSchema.optional();
        }
        shape[key] = fieldSchema;
    }

    return z.object(shape);
}

/**
 * Fetches tool definitions from the MCP client and creates DynamicStructuredTool instances.
 * @returns A promise that resolves to an array of DynamicStructuredTool instances.
 */
export async function createMcpTools(): Promise<DynamicStructuredTool[]> {
    const mcpClient = getMcpClientManager();
    const toolDefs = await mcpClient.listTools();
    const dynamicTools: DynamicStructuredTool[] = [];

    for (const toolDef of toolDefs) {
        const schema = jsonSchemaToZod(toolDef.input_schema);

        const tool = new DynamicStructuredTool({
            name: toolDef.name, // Already prefixed, e.g., "github_create_issue"
            description: toolDef.description,
            schema: schema,
            func: async (args: any) => {
                try {
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

        dynamicTools.push(tool);
    }

    console.log(
        "Dynamically created MCP tools:",
        dynamicTools.map((t) => t.name).join(", ")
    );
    return dynamicTools;
}
