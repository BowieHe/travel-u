/**
 * MCP 相关类型定义
 */
export interface McpStatus {
	initialized: boolean;
	tools: McpTool[];
	error?: string;
}

export interface McpTool {
	name: string;
	description: string;
	mcpName?: string;
	inputSchema?: any;
}

export interface McpInitializedEvent {
	success: boolean;
	toolCount?: number;
	error?: string;
}

/**
 * MCP 客户端配置
 */
export interface McpServerConfig {
	type: "stdio" | "sse";
	command?: string;
	args?: string[];
	url?: string;
	env?: Record<string, string>;
}

export interface McpConfigs {
	mcpServers: Record<string, McpServerConfig>;
}

/**
 * MCP 工具定义
 */
export interface ToolDefinition {
	mcpName: string;
	name: string;
	description: string;
	inputSchema: any;
}
