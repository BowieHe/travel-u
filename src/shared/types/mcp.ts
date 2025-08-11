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
export interface BaseMCP<T extends 'sse' | 'stdio'> {
    type: T;
}

export interface StdioServerConfig extends BaseMCP<'stdio'> {
    type: 'stdio';
    command: string;
    args: string[];
    env?: Record<string, string>;
}

export interface SSEServerConfig extends BaseMCP<'sse'> {
    type: 'sse';
    url: string;
}

export interface MCPConfigs {
    mcpServers: {
        [key: string]: StdioServerConfig | SSEServerConfig;
    };
}

export interface ToolDefinition {
    mcpName: string;
    name: string;
    description: string;
    inputSchema: object;
}
