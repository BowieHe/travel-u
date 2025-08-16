/**
 * Electron IPC 聊天 API 接口
 * 通过 IPC 与主进程通信
 */
export interface ChatAPI {
    streamMessage(message: string): Promise<void>;
    resumeMessage(message: string): Promise<void>;
    onMessage(callback: (chunk: string) => void): void;
    onComplete(callback: () => void): void;
    onError(callback: (error: string) => void): void;
    cleanup(): void;
}

/**
 * Electron 环境的 IPC API 实现
 */
export class ElectronChatAPI implements ChatAPI {
    private messageCallback?: (chunk: string) => void;
    private completeCallback?: () => void;
    private errorCallback?: (error: string) => void;

    constructor() {
        // 设置IPC监听器
        this.setupIpcListeners();
    }

    private setupIpcListeners(): void {
        if (typeof window !== 'undefined' && window.electronAPI) {
            window.electronAPI.onChatMessageChunk((chunk: string) => {
                this.messageCallback?.(chunk);
            });

            window.electronAPI.onChatMessageComplete(() => {
                this.completeCallback?.();
            });

            window.electronAPI.onChatMessageError((error: string) => {
                this.errorCallback?.(error);
            });
        }
    }

    async streamMessage(message: string): Promise<void> {
        return this.processMessage(message, false);
    }

    async resumeMessage(message: string): Promise<void> {
        return this.processMessage(message, true);
    }

    private async processMessage(message: string, resume: boolean): Promise<void> {
        try {
            if (typeof window === 'undefined' || !window.electronAPI) {
                throw new Error('Electron API not available');
            }

            const result = await window.electronAPI.chatStreamMessage(message);
            if (!result.success) {
                throw new Error(result.error || '消息发送失败');
            }
        } catch (error: any) {
            this.errorCallback?.(error.message || '消息处理失败');
        }
    }

    onMessage(callback: (chunk: string) => void): void {
        this.messageCallback = callback;
    }

    onComplete(callback: () => void): void {
        this.completeCallback = callback;
    }

    onError(callback: (error: string) => void): void {
        this.errorCallback = callback;
    }

    cleanup(): void {
        this.messageCallback = undefined;
        this.completeCallback = undefined;
        this.errorCallback = undefined;
    }
}

/**
 * 创建聊天 API 实例（现在只返回 Electron 实现）
 */
export function createChatAPI(): ChatAPI {
    return new ElectronChatAPI();
}