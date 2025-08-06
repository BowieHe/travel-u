import { BrowserWindow } from "electron";
import * as path from "path";
import { setupAiHandler } from "./ipc/ai-handler";
import { setupMcpHandler } from "./ipc/mcp-handler";
import {
	setupBrowserHandler,
	cleanupBrowserView,
	handleWindowResize,
} from "./ipc/browser-handler";
import { AppContext } from "./app-context";

export function createWindow(): BrowserWindow {
	const context = AppContext.getInstance();
	const mainWindow = new BrowserWindow({
		height: 800,
		width: 1200,
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	context.mainWindow = mainWindow;

	// 设置IPC处理器
	setupAiHandler();
	setupMcpHandler();
	setupBrowserHandler();

	// 处理窗口大小变化
	mainWindow.on("resize", () => {
		handleWindowResize();
	});

	// 加载页面
	if (process.env.NODE_ENV === "development") {
		// 在开发模式下连接到 Vite 开发服务器
		mainWindow.loadURL("http://localhost:5174"); // 使用正确的端口
		mainWindow.webContents.openDevTools();
	} else {
		mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
	}

	return mainWindow;
}

export function cleanupWindow(): void {
	cleanupBrowserView();
}
