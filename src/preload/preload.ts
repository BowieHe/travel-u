import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	// 系统信息 API
	getVersion: () => process.versions.electron,
	getPlatform: () => process.platform,

	// IPC 通信 API (用于与AI后端通信)
	sendMessage: (message: string) => ipcRenderer.invoke("ai-chat", message),
	onAIResponse: (callback: (response: string) => void) =>
		ipcRenderer.on("ai-response", (_, response) => callback(response)),

	// 地图相关 API
	getMapConfig: () => ({
		amapKey: process.env.AMAP_WEB_API || "YOUR_AMAP_KEY_HERE",
	}),
});

// 声明全局类型
declare global {
	interface Window {
		electronAPI: {
			getVersion: () => string;
			getPlatform: () => string;
			sendMessage: (message: string) => Promise<string>;
			onAIResponse: (callback: (response: string) => void) => void;
			getMapConfig: () => { amapKey: string };
		};
	}
}
