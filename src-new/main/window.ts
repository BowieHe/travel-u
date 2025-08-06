import { BrowserWindow } from "electron";
import * as path from "path";
import { APP_CONFIG, IPC_CHANNELS } from "../shared/constants/config";
import { EnvUtils } from "../shared/utils/env";
import { registerAllHandlers } from "./ipc";
import { handleWindowResize, cleanupBrowserView } from "./ipc/browser-handler";

/**
 * 创建主窗口
 */
export function createWindow(): BrowserWindow {
	const mainWindow = new BrowserWindow({
		height: APP_CONFIG.window.defaultHeight,
		width: APP_CONFIG.window.defaultWidth,
		minHeight: APP_CONFIG.window.minHeight,
		minWidth: APP_CONFIG.window.minWidth,
		webPreferences: {
			preload: path.join(__dirname, "../preload/index.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
		titleBarStyle: "hiddenInset",
		title: APP_CONFIG.name,
	});

	// 注册所有IPC处理器
	registerAllHandlers(mainWindow);

	// 处理窗口大小变化
	mainWindow.on("resize", () => {
		handleWindowResize(mainWindow);
	});

	// 加载页面
	if (EnvUtils.isDevelopment()) {
		// 开发模式：连接到Vite开发服务器
		const devUrl = `http://localhost:${APP_CONFIG.dev.serverPort}`;
		mainWindow.loadURL(devUrl);

		if (APP_CONFIG.dev.openDevTools) {
			mainWindow.webContents.openDevTools();
		}
	} else {
		// 生产模式：加载本地文件
		mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
	}

	return mainWindow;
}

/**
 * 清理窗口资源
 */
export function cleanupWindow(mainWindow: BrowserWindow): void {
	cleanupBrowserView(mainWindow);
}
