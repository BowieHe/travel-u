import { app, BrowserWindow, BrowserView, ipcMain } from "electron";
import * as path from "path";
import { initializeGraph } from "../core/graph/graph";
import { HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../core/types/type";
import { initFromConfig, getMcpClientManager } from "../core/mcp/mcp-client";

let mainWindow: BrowserWindow;
let browserView: BrowserView | null = null;
let travelGraph: any = null;
let mcpClientManager: any = null;
let conversationState: AgentState = {
	messages: [],
	next: "orchestrator",
	tripPlan: {},
	memory: {},
	subtask: [],
	currentTaskIndex: 0,
	user_interaction_complete: false,
};

// 初始化 MCP Client Manager
async function initializeMcpClient(): Promise<void> {
	try {
		console.log("初始化 MCP Client Manager...");
		const configPath = path.join(
			__dirname,
			"../../config/mcp-servers.json"
		);
		mcpClientManager = await initFromConfig(configPath);
		console.log("MCP Client Manager 初始化成功");

		// 列出所有可用工具（可选，用于调试）
		const tools = await mcpClientManager.listTools();
		console.log(
			"可用的 MCP 工具:",
			tools.map((tool: any) => tool.name).join(", ")
		);
	} catch (error) {
		console.error("MCP Client Manager 初始化失败:", error);
		// 不抛出错误，允许应用继续运行
	}
}

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

	browserView.webContents.on(
		"did-fail-load",
		(event, errorCode, errorDescription) => {
			console.error(
				"BrowserView failed to load:",
				errorCode,
				errorDescription
			);
			mainWindow.webContents.send("browser-view-error", {
				errorCode,
				errorDescription,
			});
		}
	);

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

	// AI 聊天处理器
	ipcMain.handle("ai-chat", async (event, message: string) => {
		try {
			console.log("收到聊天消息:", message);

			// 初始化图（如果还没有初始化）
			if (!travelGraph) {
				console.log("初始化 LangGraph...");
				travelGraph = await initializeGraph();
			}

			// 创建用户消息
			const userMessage = new HumanMessage({ content: message });

			// 更新对话状态
			conversationState.messages = [
				...conversationState.messages,
				userMessage,
			];

			// 调用图处理消息
			console.log("调用 LangGraph 处理消息...");
			const result = await travelGraph.invoke(conversationState, {
				configurable: { thread_id: "travel-chat-session" },
			});

			// 更新对话状态
			conversationState = { ...conversationState, ...result };

			// 获取最后一条 AI 消息作为回复
			const lastMessage = result.messages[result.messages.length - 1];
			const aiResponse =
				lastMessage?.content || "抱歉，我遇到了一些问题，请重试。";

			console.log("AI 响应:", aiResponse);
			return aiResponse;
		} catch (error) {
			console.error("AI 聊天处理错误:", error);
			return "抱歉，我遇到了一个错误，请稍后重试。";
		}
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
}

// 应用启动时的初始化序列
app.whenReady().then(async () => {
	// 1. 首先初始化 MCP Client（静默运行，不阻塞界面）
	await initializeMcpClient();

	// 2. 然后创建窗口
	createWindow();
});

app.on("window-all-closed", () => {
	// 清理 BrowserView
	if (browserView && mainWindow) {
		mainWindow.removeBrowserView(browserView);
		browserView = null;
	}

	// 清理 MCP Client
	if (mcpClientManager) {
		mcpClientManager.shutdown().catch(console.error);
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
app.on("before-quit", async () => {
	if (browserView && mainWindow) {
		mainWindow.removeBrowserView(browserView);
		browserView = null;
	}

	// 清理 MCP Client
	if (mcpClientManager) {
		try {
			await mcpClientManager.shutdown();
			console.log("MCP Client Manager 已清理");
		} catch (error) {
			console.error("清理 MCP Client Manager 时出错:", error);
		}
	}
});
