import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/constants/config";
import { LangGraphService } from "../services/langgraph";
import { McpService } from "../services/mcp/mcp";

/**
 * AI 聊天相关的 IPC 处理器
 */
export class ChatIpcHandler {
    private langGraphService: LangGraphService;
    private mcpService: McpService;

    constructor() {
        this.langGraphService = LangGraphService.getInstance();
        this.mcpService = McpService.getInstance();
        this.setupHandlers();
    }

    private setupHandlers(): void {
        // 处理流式聊天 - 只保留这一个聊天方式
        ipcMain.handle(
            IPC_CHANNELS.AI_CHAT_STREAM,
            async (event, message: string) => {
                try {
                    console.log("开始流式处理消息:", message);

                    if (!this.langGraphService.isReady()) {
                        await this.initializeServices();
                    }

                    // 使用流式处理
                    const stream = this.langGraphService.streamMessage(message);

                    for await (const chunk of stream) {
                        // 实时发送流式数据到前端
                        event.sender.send(
                            IPC_CHANNELS.AI_RESPONSE_STREAM,
                            chunk
                        );
                    }

                    // 标记流式处理完成
                    event.sender.send(IPC_CHANNELS.AI_RESPONSE_STREAM_END);

                    return "Stream completed";
                } catch (error: any) {
                    console.error("流式处理时出错:", error);
                    event.sender.send(
                        IPC_CHANNELS.AI_RESPONSE_STREAM_ERROR,
                        error.message
                    );
                    return error.message;
                }
            }
        );

        // 重置聊天会话
        ipcMain.handle(
            IPC_CHANNELS.AI_RESET_SESSION,
            async (event, sessionId?: string) => {
                try {
                    await this.langGraphService.resetSession(
                        sessionId || "default"
                    );
                    return { success: true };
                } catch (error: any) {
                    console.error("重置会话时出错:", error);
                    return { success: false, error: error.message };
                }
            }
        );
    }

    /**
     * 初始化所有必要的服务
     */
    private async initializeServices(): Promise<void> {
        try {
            // 先初始化 MCP 服务
            if (!this.mcpService.isReady()) {
                await this.mcpService.initialize();
            }

            // 再初始化 LangGraph 服务
            if (!this.langGraphService.isReady()) {
                await this.langGraphService.initialize();
            }

            console.log("所有服务初始化完成");
        } catch (error) {
            console.error("服务初始化失败:", error);
            throw error;
        }
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        // 移除所有 IPC 监听器
        ipcMain.removeAllListeners(IPC_CHANNELS.AI_CHAT_STREAM);
        ipcMain.removeAllListeners(IPC_CHANNELS.AI_RESET_SESSION);

        console.log("Chat IPC handlers 已清理");
    }
}
