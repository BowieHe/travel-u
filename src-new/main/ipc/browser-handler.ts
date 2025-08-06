import { ipcMain, BrowserWindow, BrowserView } from "electron";
import { IPC_CHANNELS, APP_CONFIG } from "../../shared/constants/config";

let browserView: BrowserView | null = null;

/**
 * 注册浏览器视图相关的IPC处理器
 */
export function registerBrowserHandlers(mainWindow: BrowserWindow): void {
	ipcMain.handle(
		IPC_CHANNELS.TOGGLE_BROWSER_VIEW,
		(event, isOpen: boolean) => {
			if (isOpen) {
				// 显示 BrowserView
				if (!browserView) {
					browserView = createBrowserView(mainWindow);
				}
				mainWindow.setBrowserView(browserView);
				// 设置位置和大小
				const bounds = mainWindow.getBounds();
				browserView.setBounds({
					x: 0,
					y: 0,
					width: APP_CONFIG.browserView.width,
					height: bounds.height,
				});
				browserView.webContents.focus();
			} else {
				// 隐藏 BrowserView
				if (browserView) {
					mainWindow.removeBrowserView(browserView);
				}
			}
			return isOpen;
		}
	);
}

/**
 * 创建浏览器视图
 */
function createBrowserView(mainWindow: BrowserWindow): BrowserView {
	if (browserView) {
		return browserView;
	}

	browserView = new BrowserView({
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webSecurity: true,
		},
	});

	// 加载网页
	browserView.webContents.loadURL(APP_CONFIG.browserView.defaultUrl);

	// 设置用户代理
	browserView.webContents.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
	);

	// 添加事件监听器
	browserView.webContents.on("did-start-loading", () => {
		console.log("BrowserView started loading");
		mainWindow.webContents.send(IPC_CHANNELS.BROWSER_VIEW_LOADING, true);
	});

	browserView.webContents.on("did-finish-load", () => {
		console.log("BrowserView finished loading");
		mainWindow.webContents.send(IPC_CHANNELS.BROWSER_VIEW_LOADING, false);
	});

	browserView.webContents.on(
		"did-fail-load",
		(event, errorCode, errorDescription) => {
			console.error(
				"BrowserView failed to load:",
				errorCode,
				errorDescription
			);
			mainWindow.webContents.send(IPC_CHANNELS.BROWSER_VIEW_ERROR, {
				errorCode,
				errorDescription,
			});
		}
	);

	return browserView;
}

/**
 * 清理浏览器视图
 */
export function cleanupBrowserView(mainWindow: BrowserWindow): void {
	if (browserView && mainWindow) {
		mainWindow.removeBrowserView(browserView);
		browserView = null;
	}
}

/**
 * 处理窗口大小变化
 */
export function handleWindowResize(mainWindow: BrowserWindow): void {
	if (browserView && mainWindow.getBrowserView() === browserView) {
		const bounds = mainWindow.getBounds();
		browserView.setBounds({
			x: 0,
			y: 0,
			width: APP_CONFIG.browserView.width,
			height: bounds.height,
		});
	}
}
