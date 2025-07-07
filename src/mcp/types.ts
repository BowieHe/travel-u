export interface BaseMCP<T extends "sse" | "stdio"> {
    type: T;
}

export interface StdioServerConfig extends BaseMCP<"stdio"> {
    type: "stdio";
    command: string;
    args: string[];
    env?: Record<string, string>;
}

export interface SSEServerConfig extends BaseMCP<"sse"> {
    type: "sse";
    url: string;
}

export interface MCPConfigs {
    mcpServers: {
        [key: string]: StdioServerConfig | SSEServerConfig;
    };
}

export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: string;
}
