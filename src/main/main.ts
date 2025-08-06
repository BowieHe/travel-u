import { app, BrowserWindow, BrowserView, ipcMain } from "electron";
import * as path from "path";

let mainWindow: BrowserWindow;
let browserView: BrowserView | null = null;

function createBrowserView(): BrowserView {
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
	browserView.webContents.loadURL("https://www.bing.com");

	// 设置用户代理
	browserView.webContents.setUserAgent(
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
	);

	// 添加事件监听器
	browserView.webContents.on("did-start-loading", () => {
		console.log("BrowserView started loading");
		mainWindow.webContents.send("browser-view-loading", true);
	});

	browserView.webContents.on("did-finish-load", () => {
		console.log("BrowserView finished loading");
		mainWindow.webContents.send("browser-view-loading", false);
	});

	browserView.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
		console.error("BrowserView failed to load:", errorCode, errorDescription);
		mainWindow.webContents.send("browser-view-error", { errorCode, errorDescription });
	});

	return browserView;
}

function createWindow(): void {
	mainWindow = new BrowserWindow({
		height: 800,
		width: 1200,
		webPreferences: {
			preload: path.join(__dirname, "../preload/preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	// IPC 处理器
	ipcMain.handle("toggle-browser-view", (event, isOpen: boolean) => {
		if (isOpen) {
			// 显示 BrowserView
			if (!browserView) {
				browserView = createBrowserView();
			}
			mainWindow.setBrowserView(browserView);
			// 设置位置和大小 (左侧抽屉: 宽度500px)
			const bounds = mainWindow.getBounds();
			browserView.setBounds({
				x: 0,
				y: 0,
				width: 500,
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
	});

	// 处理窗口大小变化
	mainWindow.on("resize", () => {
		if (browserView && mainWindow.getBrowserView() === browserView) {
			const bounds = mainWindow.getBounds();
			browserView.setBounds({
				x: 0,
				y: 0,
				width: 500,
				height: bounds.height,
			});
		}
	});

	if (process.env.NODE_ENV === "development") {
		// 在开发模式下连接到 Vite 开发服务器
		mainWindow.loadURL("http://localhost:5173");
		mainWindow.webContents.openDevTools();
	} else {
		mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
	}
}app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
	// 清理 BrowserView
	if (browserView && mainWindow) {
		mainWindow.removeBrowserView(browserView);
		browserView = null;
	}
	
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

// 应用退出时清理
app.on("before-quit", () => {
	if (browserView && mainWindow) {
		mainWindow.removeBrowserView(browserView);
		browserView = null;
	}
});