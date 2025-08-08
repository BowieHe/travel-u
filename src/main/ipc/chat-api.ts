import { isElectron, envInfo } from '@shared/utils/env-detector';

/**
 * 通用的聊天 API 接口
 * 支持 Web 和 Electron 两种环境
 */

export interface ChatAPI {
    streamMessage(message: string): Promise<void>;
    onMessage(callback: (chunk: string) => void): void;
    onComplete(callback: () => void): void;
    onError(callback: (error: string) => void): void;
    cleanup(): void;
}

/**
 * Web 环境的 API 实现 - 使用 HTTP 流式请求
 */
export class WebChatAPI implements ChatAPI {
    private messageCallback?: (chunk: string) => void;
    private completeCallback?: () => void;
    private errorCallback?: (error: string) => void;

    async streamMessage(message: string): Promise<void> {
        try {
            await this.callAPI(message);
        } catch (error: any) {
            if (this.errorCallback) {
                this.errorCallback(error.message);
            } else {
                // 如果没有设置错误回调，直接抛出异常
                throw error;
            }
        }
    }

    private async callAPI(message: string): Promise<void> {
        const response = await fetch('/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();

            if (done) {
                // 完成回调是可选的
                this.completeCallback?.();
                break;
            }

            const chunk = decoder.decode(value, { stream: true });
            // messageCallback 在 streamMessage 中已确保存在
            this.messageCallback!(chunk);
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
 * Electron 环境的 API 实现 - 使用 IPC
 */
export class ElectronChatAPI implements ChatAPI {
    private messageCallback?: (chunk: string) => void;
    private completeCallback?: () => void;
    private errorCallback?: (error: string) => void;

    async streamMessage(message: string): Promise<void> {
        if (!window.electronAPI) {
            throw new Error('Electron API not available');
        }

        // 清理之前的监听器
        this.cleanup();

        // 设置新的监听器
        window.electronAPI.onAIResponseStream((chunk: string) => {
            if (this.messageCallback) {
                this.messageCallback(chunk);
            }
        });

        window.electronAPI.onAIResponseStreamEnd(() => {
            if (this.completeCallback) {
                this.completeCallback();
            }
        });

        window.electronAPI.onAIResponseStreamError((error: string) => {
            if (this.errorCallback) {
                this.errorCallback(error);
            }
        });

        // 发送消息
        await window.electronAPI.streamMessage(message);
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
        if (window.electronAPI) {
            window.electronAPI.onAIResponseStream(() => {});
            window.electronAPI.onAIResponseStreamEnd(() => {});
            window.electronAPI.onAIResponseStreamError(() => {});
        }
        this.messageCallback = undefined;
        this.completeCallback = undefined;
        this.errorCallback = undefined;
    }
}

/**
 * 自动检测环境并返回相应的 API 实例
 */
export function createChatAPI(): ChatAPI {
    console.log('Environment detection:', envInfo);

    if (isElectron) {
        return new ElectronChatAPI();
    }

    // 默认使用 Web API
    return new WebChatAPI();
}
