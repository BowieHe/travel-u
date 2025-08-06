import { contextBridge, ipcRenderer } from "electron";
import { McpStatus, McpInitializedEvent } from "@/shared/types/conversation";

declare global {
	interface Window {
		electronAPI: {
			// 系统信息
			getVersion: () => string;
			getPlatform: () => string;

			// AI 聊天
			sendMessage: (message: string) => Promise<string>;
			onAIResponse: (callback: (response: string) => void) => void;

			// MCP 状态
			getMcpStatus: () => Promise<McpStatus>;
			onMcpInitialized: (
				callback: (status: McpInitializedEvent) => void
			) => void;

			// 地图配置
			getMapConfig: () => { amapKey: string };

			// BrowserView 控制
			toggleBrowserView: (isOpen: boolean) => Promise<boolean>;
			onBrowserViewLoading: (
				callback: (isLoading: boolean) => void
			) => void;
			onBrowserViewError: (
				callback: (error: {
					errorCode: number;
					errorDescription: string;
				}) => void
			) => void;
		};
	}
}

contextBridge.exposeInMainWorld("electronAPI", {
	// 系统信息 API
	getVersion: () => process.versions.electron,
	getPlatform: () => process.platform,

	// IPC 通信 API (用于与AI后端通信)
	sendMessage: (message: string) => ipcRenderer.invoke("ai-chat", message),
	onAIResponse: (callback: (response: string) => void) =>
		ipcRenderer.on("ai-response", (_, response) => callback(response)),

	// MCP 状态 API
	getMcpStatus: () => ipcRenderer.invoke("get-mcp-status"),
	onMcpInitialized: (callback: (status: McpInitializedEvent) => void) =>
		ipcRenderer.on("mcp-initialized", (_, status) => callback(status)),

	// 地图相关 API
	getMapConfig: () => ({
		amapKey: process.env.AMAP_WEB_API || "YOUR_AMAP_KEY_HERE",
	}),

	// BrowserView 控制 API
	toggleBrowserView: (isOpen: boolean) =>
		ipcRenderer.invoke("toggle-browser-view", isOpen),
	onBrowserViewLoading: (callback: (isLoading: boolean) => void) =>
		ipcRenderer.on("browser-view-loading", (_, isLoading) =>
			callback(isLoading)
		),
	onBrowserViewError: (
		callback: (error: {
			errorCode: number;
			errorDescription: string;
		}) => void
	) => ipcRenderer.on("browser-view-error", (_, error) => callback(error)),
});
