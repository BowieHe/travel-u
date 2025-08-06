import { ipcMain } from "electron";
import { GraphService } from "../services/graph-service";
import { McpService } from "../services/mcp-service";

export function setupAiHandler(): void {
	ipcMain.handle("ai-chat", async (event, message: string) => {
		try {
			console.log("收到聊天消息:", message);

			const graphService = GraphService.getInstance();
			const mcpService = McpService.getInstance();

			// 检查MCP客户端是否已初始化
			if (!mcpService.isReady()) {
				console.log("MCP客户端尚未初始化，等待中...");
				return "AI助手正在初始化中，请稍后再试，或者先告诉我您的旅行需求。";
			}

			const aiResponse = await graphService.processMessage(message);
			console.log("AI 响应:", aiResponse);
			return aiResponse;
		} catch (error) {
			console.error("AI 聊天处理错误:", error);
			return "抱歉，我遇到了一个错误，请稍后重试。";
		}
	});
}
