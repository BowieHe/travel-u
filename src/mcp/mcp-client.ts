/**
 * @file Manages communication with MCP servers using the official @modelcontextprotocol/sdk.
 *
 * This file implements a manager that initializes and holds multiple active MCP clients
 * based on a configuration file. It abstracts the client-specific logic from the rest
 * of the application.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import * as fs from "fs/promises";
import * as path from "path";
import { MCPConfigs, ToolDefinition } from "@/mcp/types";
import { interpolateEnvVars, resolveCommandPath } from "@/utils/command";

/**
 * A manager class to hold and interact with multiple MCP clients.
 */
export class McpClientManager {
	private clients: Map<string, Client> = new Map();

	/**
	 * Iterates through all registered clients, fetches their tools,
	 * and returns a single aggregated list. Tool names are prefixed
	 * with the client name to ensure uniqueness (e.g., "github_create_issue").
	 * @returns A promise that resolves to an array of unique tool definitions.
	 */
	async listTools(): Promise<ToolDefinition[]> {
		const allTools: ToolDefinition[] = [];
		for (const [clientName, client] of this.clients.entries()) {
			const clientToolsResult = await client.listTools();
			console.log(
				"get tools from client:",
				clientName,
				clientToolsResult.tools.map((tool) => tool.name).join(", ")
			);
			if (clientToolsResult && Array.isArray(clientToolsResult.tools)) {
				for (const tool of clientToolsResult.tools) {
					allTools.push({
						mcpName: clientName,
						name: `${clientName}__${tool.name}`, // Use double underscore as a safe separator
						description: tool.description || "",
						inputSchema: tool.inputSchema,
					});
				}
			}
		}
		return allTools;
	}

	/**
	 * Calls a tool by its prefixed name. It parses the client name from the
	 * prefix and delegates the call to the correct client instance.
	 * @param prefixedToolName The name of the tool, e.g., "github_create_issue".
	 * @param args The arguments to pass to the tool.
	 * @returns A promise that resolves to the result of the tool call.
	 */
	async callTool(prefixedToolName: string, args: any): Promise<any> {
		console.log(
			`calling tools with name:`,
			prefixedToolName,
			" and args",
			args
		);
		const parts = prefixedToolName.split("__");
		if (parts.length < 2) {
			throw new Error(
				`Invalid tool name format: ${prefixedToolName}. Expected 'clientName__toolName'.`
			);
		}
		const clientName = parts[0];
		const originalToolName = parts.slice(1).join("__");

		const client = this.clients.get(clientName);
		if (!client) {
			throw new Error(
				`No MCP client registered with name: ${clientName}`
			);
		}

		console.log(
			`Forwarding tool call '${originalToolName}' to client '${clientName}'`
		);
		return client.callTool({
			name: originalToolName,
			arguments: args,
		});
	}

	/**
	 * Adds a client to the manager.
	 * @param name The name to register the client under.
	 * @param client The client instance.
	 */
	registerClient(name: string, client: Client): void {
		this.clients.set(name, client);
		console.log(`MCP Client: Successfully registered client '${name}'.`);
	}

	/**
	 * Disconnects all registered MCP clients.
	 */
	async shutdown(): Promise<void> {
		console.log("Shutting down all MCP clients...");
		for (const [name, client] of this.clients.entries()) {
			try {
				await client.close();
				console.log(`Client '${name}' disconnected.`);
			} catch (error) {
				console.error(`Error disconnecting client ${name}:`, error);
			}
		}
		console.log("All MCP clients have been shut down.");
	}
}

let clientManagerInstance: McpClientManager | null = null;

/**
 * Initializes the McpClientManager by reading server configurations,
 * creating and connecting clients, and registering them with the manager.
 * @returns A promise that resolves to the initialized McpClientManager instance.
 */

export async function initFromConfig(
	...location: string[]
): Promise<McpClientManager> {
	const configPath = path.join(...location);
	const configFile = await fs.readFile(configPath, "utf-8");
	const config: MCPConfigs = JSON.parse(configFile);

	return initializeMcpClientManager(config);
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_RETRIES = 3;

export async function initializeMcpClientManager(
	config: MCPConfigs,
	options: {
		timeoutMs?: number;
		maxRetries?: number;
	} = {}
): Promise<McpClientManager> {
	const { timeoutMs = DEFAULT_TIMEOUT_MS, maxRetries = DEFAULT_RETRIES } =
		options;
	if (clientManagerInstance) {
		return clientManagerInstance;
	}

	const manager = new McpClientManager();
	for (const [name, conf] of Object.entries(config.mcpServers)) {
		let lastError: Error | null = null;
		let retryCount = 0;

		while (retryCount <= maxRetries) {
			try {
				const client = new Client({
					name: `${name}-client`,
					version: "1.0.0",
				});
				let transport;

				if (conf.type === "stdio") {
					const realCommand = resolveCommandPath(conf.command);
					if (!realCommand) {
						throw new Error(
							`Failed to resolve path for command: ${conf.command}`
						);
					}
					// Smartly create the environment for the child process.
					const env = { ...(conf.env || {}) };

					// Inject proxy settings if they are present in the parent process
					if (process.env.HTTP_PROXY) {
						env.HTTP_PROXY = process.env.HTTP_PROXY;
					}
					if (process.env.HTTPS_PROXY) {
						env.HTTPS_PROXY = process.env.HTTPS_PROXY;
					}

					if (!env.PATH) {
						const systemPaths = "/usr/bin:/bin";
						const currentPath = process.env.PATH || "";
						env.PATH = `${currentPath}:${systemPaths}`;
					}

					transport = new StdioClientTransport({
						command: realCommand,
						args: conf.args,
						env: env,
					});
				} else {
					const convertedUrl = interpolateEnvVars(conf.url);
					transport = new SSEClientTransport(new URL(convertedUrl));
				}

				// Add timeout to client connection
				await Promise.race([
					client.connect(transport),
					new Promise((_, reject) =>
						setTimeout(
							() =>
								reject(
									new Error(
										`Connection timeout after ${timeoutMs}ms`
									)
								),
							timeoutMs
						)
					),
				]);

				manager.registerClient(name, client);
				break; // Success - exit retry loop
			} catch (error) {
				lastError = error as Error;
				retryCount++;
				if (retryCount <= maxRetries) {
					console.warn(
						`Retrying client ${name} (attempt ${retryCount}/${maxRetries})...`,
						error
					);
					await new Promise((res) =>
						setTimeout(res, 1000 * retryCount)
					); // Exponential backoff
				} else {
					console.error(
						`Failed to initialize client ${name} after ${maxRetries} attempts:`,
						error
					);
					throw new Error(
						`Failed to initialize client ${name}: ${lastError.message}`
					);
				}
			}
		}
	}

	clientManagerInstance = manager;
	return clientManagerInstance;
}

/**
 * Gets the singleton instance of the McpClientManager.
 * @returns The singleton instance.
 */
export function getMcpClientManager(): McpClientManager {
	if (!clientManagerInstance) {
		throw new Error("McpClientManager not initialized.");
	}
	return clientManagerInstance;
}
