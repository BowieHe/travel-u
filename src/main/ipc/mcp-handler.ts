import { ipcMain } from "electron";
import { McpService } from "../services/mcp";
import { IPC_CHANNELS } from "../../shared/constants/config";

/**
 * 注册MCP相关的IPC处理器
 */
export function registerMcpHandlers(): void {
    ipcMain.handle(IPC_CHANNELS.GET_MCP_STATUS, async () => {
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
