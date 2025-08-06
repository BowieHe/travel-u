import { ipcMain, BrowserWindow, BrowserView } from "electron";

import { AppContext } from "../app-context";

export function setupBrowserHandler(): void {
	const context = AppContext.getInstance();
	ipcMain.handle("toggle-browser-view", (event, isOpen: boolean) => {
		if (!context.mainWindow) return;

		if (isOpen) {
			// 显示 BrowserView
			if (!context.browserView) {
				context.browserView = createBrowserView();
			}
			context.mainWindow.setBrowserView(context.browserView);
			// 设置位置和大小 (左侧抽屉: 宽度500px)
			const bounds = context.mainWindow.getBounds();
			context.browserView.setBounds({
				x: 0,
				y: 0,
				width: 500,
				height: bounds.height,
			});
			context.browserView.webContents.focus();
		} else {
			// 隐藏 BrowserView
			if (context.browserView) {
				context.mainWindow.removeBrowserView(context.browserView);
			}
		}
		return isOpen;
	});
}

function createBrowserView(): BrowserView {
	const context = AppContext.getInstance();
	if (context.browserView) {
		return context.browserView;
	}

	const newBrowserView = new BrowserView({
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webSecurity: true,
		},
	});

	// 加载网页
	newBrowserView.webContents.loadURL("https://www.bing.com");

	// 设置用户代理
	newBrowserView.webContents.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
	);

	// 添加事件监听器
	newBrowserView.webContents.on("did-start-loading", () => {
		console.log("BrowserView started loading");
		context.mainWindow?.webContents.send("browser-view-loading", true);
	});

	newBrowserView.webContents.on("did-finish-load", () => {
		console.log("BrowserView finished loading");
		context.mainWindow?.webContents.send("browser-view-loading", false);
	});

	newBrowserView.webContents.on(
		"did-fail-load",
		(event, errorCode, errorDescription) => {
			console.error(
				"BrowserView failed to load:",
				errorCode,
				errorDescription
			);
			context.mainWindow?.webContents.send("browser-view-error", {
				errorCode,
				errorDescription,
			});
		}
	);

	return newBrowserView;
}

export function cleanupBrowserView(): void {
	const context = AppContext.getInstance();
	if (context.browserView && context.mainWindow) {
		context.mainWindow.removeBrowserView(context.browserView);
		context.browserView = null;
	}
}

export function handleWindowResize(): void {
	const context = AppContext.getInstance();
	if (
		context.browserView &&
		context.mainWindow?.getBrowserView() === context.browserView
	) {
		const bounds = context.mainWindow.getBounds();
		context.browserView.setBounds({
			x: 0,
			y: 0,
			width: 500,
			height: bounds.height,
		});
	}
}
