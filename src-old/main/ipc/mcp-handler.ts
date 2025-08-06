import { ipcMain } from "electron";
import { McpService } from "../services/mcp-service";

export function setupMcpHandler(): void {
	ipcMain.handle("get-mcp-status", async () => {
		try {
			const mcpService = McpService.getInstance();
			return await mcpService.getStatus();
		} catch (error) {
			console.error("获取 MCP 状态失败:", error);
			return {
				initialized: false,
				error: error instanceof Error ? error.message : String(error),
				tools: [],
			};
		}
	});
}
