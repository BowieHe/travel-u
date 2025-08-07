/**
 * 应用配置常量
 */
export const APP_CONFIG = {
    name: "Travel-U",
    version: "1.0.0",

    // 窗口配置
    window: {
        defaultWidth: 1200,
        defaultHeight: 800,
        minWidth: 800,
        minHeight: 600,
    },

    // 浏览器视图配置
    browserView: {
        width: 500,
        defaultUrl: "https://www.bing.com",
    },

    // 开发配置
    dev: {
        serverPort: 5173,
        openDevTools: true,
    },
};

/**
 * IPC 通道名称
 */
export const IPC_CHANNELS = {
    // AI 相关 - 只保留流式聊天
    AI_CHAT_STREAM: "ai-chat-stream",
    AI_RESPONSE_STREAM: "ai-response-stream",
    AI_RESPONSE_STREAM_END: "ai-response-stream-end",
    AI_RESPONSE_STREAM_ERROR: "ai-response-stream-error",
    AI_RESET_SESSION: "ai-reset-session",

    // MCP 相关
    GET_MCP_STATUS: "get-mcp-status",
    MCP_INITIALIZED: "mcp-initialized",

    // 浏览器视图相关
    TOGGLE_BROWSER_VIEW: "toggle-browser-view",
    BROWSER_VIEW_LOADING: "browser-view-loading",
    BROWSER_VIEW_ERROR: "browser-view-error",
} as const;

/**
 * 环境变量键名
 */
