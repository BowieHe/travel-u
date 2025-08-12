import { isElectron, envInfo } from '@shared/utils/env-detector';

/**
 * 通用的聊天 API 接口
 * 支持 Web 和 Electron 两种环境
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
 * Web 环境的 API 实现 - 使用 HTTP 流式请求
 */
export class WebChatAPI implements ChatAPI {
    private messageCallback?: (chunk: string) => void;
    private completeCallback?: () => void;
    private errorCallback?: (error: string) => void;
    private eventSource?: EventSource;

    async streamMessage(message: string): Promise<void> {
        return this.openSSE(message, false);
    }

    async resumeMessage(message: string): Promise<void> {
        return this.openSSE(message, true);
    }

    private async openSSE(message: string, resume: boolean) {
        this.closeES();
        try {
            const url = `/api/chat/sse?message=${encodeURIComponent(message)}${
                resume ? '&resume=1' : ''
            }`;
            this.eventSource = new EventSource(url);

            this.eventSource.addEventListener('chunk', (e: MessageEvent) => {
                try {
                    const data = JSON.parse(e.data);
                    this.messageCallback?.(data.content || '');
                } catch (err) {
                    console.warn('解析 chunk 失败', err);
                }
            });

            this.eventSource.addEventListener('done', () => {
                this.completeCallback?.();
                this.closeES();
            });

            this.eventSource.addEventListener('error', (e: MessageEvent) => {
                if (this.errorCallback) {
                    try {
                        const data = JSON.parse(e.data);
                        this.errorCallback(data.error || '未知错误');
                    } catch {
                        this.errorCallback('SSE 连接错误');
                    }
                }
                this.closeES();
            });
        } catch (error: any) {
            this.errorCallback?.(error.message || 'SSE 初始化失败');
        }
    }

    private closeES() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = undefined;
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
        this.closeES();
        this.messageCallback = undefined;
        this.completeCallback = undefined;
        this.errorCallback = undefined;
    }
}

/**
 * Electron 环境的 API 实现 - 使用 IPC (当前直接复用 Web 实现)
 */
export class ElectronChatAPI extends WebChatAPI {}

/**
 * 自动检测环境并返回相应的 API 实例
 */
export function createChatAPI(): ChatAPI {
    console.log('Environment detection:', envInfo);
    if (isElectron) {
        return new ElectronChatAPI();
    }
    return new WebChatAPI();
}
