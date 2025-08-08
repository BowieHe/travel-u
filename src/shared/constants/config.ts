/**
 * 应用配置常量
 */
export const APP_CONFIG = {
    name: 'Travel-U',
    version: '1.0.0',

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
        defaultUrl: 'https://www.bing.com',
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
    // （已移除 AI 聊天 IPC，改用 SSE HTTP）

    // MCP 相关
    GET_MCP_STATUS: 'get-mcp-status',
    MCP_INITIALIZED: 'mcp-initialized',

    // 浏览器视图相关
    TOGGLE_BROWSER_VIEW: 'toggle-browser-view',
    BROWSER_VIEW_LOADING: 'browser-view-loading',
    BROWSER_VIEW_ERROR: 'browser-view-error',
} as const;

/**
 * 环境变量键名
 */
