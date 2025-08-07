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
            // 首先尝试连接真实的 API
            if (await this.tryRealAPI(message)) {
                return;
            }

            // 如果真实 API 不可用，使用模拟响应
            await this.simulateResponse(message);
        } catch (error: any) {
            if (this.errorCallback) {
                this.errorCallback(error.message);
            }
        }
    }

    private async tryRealAPI(message: string): Promise<boolean> {
        try {
            const response = await fetch("/api/chat/stream", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ message }),
            });

            if (!response.ok) {
                // 如果 API 不存在，返回 false 使用模拟
                if (response.status === 404) {
                    return false;
                }
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body");
            }

            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    if (this.completeCallback) {
                        this.completeCallback();
                    }
                    break;
                }

                const chunk = decoder.decode(value, { stream: true });
                if (this.messageCallback) {
                    this.messageCallback(chunk);
                }
            }
            return true;
        } catch (error) {
            // API 不可用，返回 false 使用模拟
            console.log("真实 API 不可用，使用模拟响应");
            return false;
        }
    }

    private async simulateResponse(message: string): Promise<void> {
        // 模拟 AI 响应
        const responses = [
            "我理解您想要",
            message.includes("旅行") || message.includes("旅游")
                ? "规划一次完美的旅行。"
                : "获得帮助。",
            "\n\n基于您的需求，我建议：\n",
            "1. 首先确定您的旅行目的地和时间\n",
            "2. 制定详细的行程计划\n",
            "3. 预订合适的住宿和交通\n",
            "\n请告诉我更多具体信息，我会为您提供更详细的建议。",
        ];

        for (const response of responses) {
            if (this.messageCallback) {
                this.messageCallback(response);
            }
            // 模拟流式延迟
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (this.completeCallback) {
            this.completeCallback();
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
            throw new Error("Electron API not available");
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
    // 检测是否在 Electron 环境中
    if (typeof window !== "undefined" && window.electronAPI) {
        return new ElectronChatAPI();
    }

    // 默认使用 Web API
    return new WebChatAPI();
}
