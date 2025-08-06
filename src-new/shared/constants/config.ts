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
		serverPort: 5174,
		openDevTools: true,
	},
};

/**
 * IPC 通道名称
 */
export const IPC_CHANNELS = {
	// AI 相关
	AI_CHAT: "ai-chat",
	AI_RESPONSE: "ai-response",

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
export const ENV_KEYS = {
	NODE_ENV: "NODE_ENV",
	VITE_AMAP_KEY: "VITE_AMAP_KEY",
	VITE_AMAP_SECURITY_CODE: "VITE_AMAP_SECURITY_CODE",
	AMAP_WEB_API: "AMAP_WEB_API",
	OPENAI_API_KEY: "OPENAI_API_KEY",
	OPENAI_URL: "OPENAI_URL",
	DS_API_KEY: "DS_API_KEY",
	DS_URL: "DS_URL",
	GEMINI_API_KEY: "GEMINI_API_KEY",
	GEMINI_URL: "GEMINI_URL",
	VARIFLIGHT_KEY: "VARIFLIGHT_KEY",
	LANGSMITH_API_KEY: "LANGSMITH_API_KEY",
	LANGSMITH_PROJECT: "LANGSMITH_PROJECT",
} as const;
