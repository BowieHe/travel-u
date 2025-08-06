const { app, BrowserWindow } = require("electron");
import * as dotenv from "dotenv";
import * as path from "path";
import { createWindow, cleanupWindow } from "./window";
import { McpService } from "./services/mcp-service";
import { AppContext } from "./app-context";

// 加载环境变量
dotenv.config({ path: path.join(__dirname, "../../.env") });

// 应用启动时的初始化序列
app.whenReady().then(() => {
	const context = AppContext.getInstance();
	// 1. 立即创建窗口，不等待MCP客户端
	context.mainWindow = createWindow();

	// 2. 在后台异步初始化 MCP Client（不阻塞界面）
	initializeMcpClient().catch((error) => {
		console.error("后台初始化 MCP Client 失败:", error);
	});
});

async function initializeMcpClient(): Promise<void> {
	const context = AppContext.getInstance();
	try {
		const mcpService = McpService.getInstance();
		await mcpService.initialize();

		// 通知渲染进程MCP初始化完成
		if (context.mainWindow && !context.mainWindow.isDestroyed()) {
			const status = await mcpService.getStatus();
			context.mainWindow.webContents.send("mcp-initialized", {
				success: true,
				toolCount: status.tools.length,
			});
		}
	} catch (error) {
		console.error("MCP Client Manager 初始化失败:", error);

		// 通知渲染进程MCP初始化失败
		if (context.mainWindow && !context.mainWindow.isDestroyed()) {
			context.mainWindow.webContents.send("mcp-initialized", {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

app.on("window-all-closed", () => {
	const context = AppContext.getInstance();
	// 清理窗口
	if (context.mainWindow) {
		cleanupWindow();
		context.mainWindow = null;
	}

	// 清理 MCP Client
	const mcpService = McpService.getInstance();
	mcpService.shutdown().catch(console.error);

	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	const context = AppContext.getInstance();
	if (BrowserWindow.getAllWindows().length === 0) {
		context.mainWindow = createWindow();
	}
});

// 应用退出时清理
app.on("before-quit", async () => {
	const context = AppContext.getInstance();
	if (context.mainWindow) {
		cleanupWindow();
	}

	// 清理 MCP Client
	const mcpService = McpService.getInstance();
	await mcpService.shutdown();
});
