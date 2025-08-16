import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '@shared/constants/config';
import { LangGraphService } from '../services/langgraph';

/**
 * IPC 聊天处理器
 * 在主进程中处理聊天请求，通过IPC通信与渲染进程交互
 */
export class ChatIpcHandler {
    private static instance: ChatIpcHandler;
    private langGraphService: LangGraphService;

    private constructor() {
        this.langGraphService = LangGraphService.getInstance();
        this.setupIpcHandlers();
    }

    public static getInstance(): ChatIpcHandler {
        if (!ChatIpcHandler.instance) {
            ChatIpcHandler.instance = new ChatIpcHandler();
        }
        return ChatIpcHandler.instance;
    }

    private setupIpcHandlers(): void {
        // 处理聊天消息流式传输
        ipcMain.handle(IPC_CHANNELS.CHAT_STREAM_MESSAGE, async (event, message: string) => {
            try {
                const sender = event.sender;
                
                if (!this.langGraphService.isReady()) {
                    await this.langGraphService.initialize();
                }

                const stream = this.langGraphService.streamMessage(message);
                
                for await (const chunk of stream) {
                    if (typeof chunk === 'string') {
                        // 发送文本块
                        sender.send(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, chunk);
                    } else if (chunk && typeof chunk === 'object') {
                        const chunkObj = chunk as any;
                        if (chunkObj.type === 'state' && chunkObj.planTodos) {
                            // 可以在这里处理计划数据
                            sender.send(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, JSON.stringify(chunkObj));
                        } else if (chunkObj.content) {
                            sender.send(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, chunkObj.content);
                        }
                    }
                }

                // 发送完成信号
                sender.send(IPC_CHANNELS.CHAT_MESSAGE_COMPLETE);
                return { success: true };
            } catch (error: any) {
                // 发送错误信号
                event.sender.send(IPC_CHANNELS.CHAT_MESSAGE_ERROR, error.message || '消息处理失败');
                return { success: false, error: error.message };
            }
        });
    }

    public cleanup(): void {
        // 移除IPC监听器
        ipcMain.removeAllListeners(IPC_CHANNELS.CHAT_STREAM_MESSAGE);
    }
}