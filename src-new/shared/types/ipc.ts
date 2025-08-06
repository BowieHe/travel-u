import { McpStatus, McpInitializedEvent } from "./mcp";

/**
 * IPC 通道定义 - 类型安全的通信接口
 */
export interface IpcChannels {
	// AI 聊天
	"ai-chat": (message: string) => Promise<string>;

	// MCP 状态管理
	"get-mcp-status": () => Promise<McpStatus>;

	// 浏览器视图控制
	"toggle-browser-view": (isOpen: boolean) => Promise<boolean>;
}

/**
 * IPC 事件定义
 */
export interface IpcEvents {
	// AI 响应事件
	"ai-response": (response: string) => void;

	// MCP 初始化完成事件
	"mcp-initialized": (status: McpInitializedEvent) => void;

	// 浏览器视图事件
	"browser-view-loading": (isLoading: boolean) => void;
	"browser-view-error": (error: {
		errorCode: number;
		errorDescription: string;
	}) => void;
}

/**
 * Electron API 接口定义
 */
export interface ElectronAPI {
	// 系统信息
	getVersion: () => string;
	getPlatform: () => string;

	// AI 聊天
	sendMessage: (message: string) => Promise<string>;
	onAIResponse: (callback: (response: string) => void) => void;

	// MCP 状态
	getMcpStatus: () => Promise<McpStatus>;
	onMcpInitialized: (callback: (status: McpInitializedEvent) => void) => void;

	// 地图配置
	getMapConfig: () => { amapKey: string };

	// BrowserView 控制
	toggleBrowserView: (isOpen: boolean) => Promise<boolean>;
	onBrowserViewLoading: (callback: (isLoading: boolean) => void) => void;
	onBrowserViewError: (
		callback: (error: {
			errorCode: number;
			errorDescription: string;
		}) => void
	) => void;
}

// 全局类型声明
declare global {
	interface Window {
		electronAPI: ElectronAPI;
	}
}
