import { HumanMessage } from "@langchain/core/messages";
import { initializeGraph } from "./workflows/main-graph";
import { AgentState } from "./utils/agent-type";

/**
 * LangGraph 服务类
 * 处理聊天消息并执行 AI 工作流
 */
export class LangGraphService {
    private static instance: LangGraphService | null = null;
    private graph: any = null;
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    private constructor() {}

    static getInstance(): LangGraphService {
        if (!LangGraphService.instance) {
            LangGraphService.instance = new LangGraphService();
        }
        return LangGraphService.instance;
    }

    /**
     * 初始化 LangGraph
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.doInitialize();
        return this.initializationPromise;
    }

    private async doInitialize(): Promise<void> {
        try {
            console.log("初始化 LangGraph...");
            this.graph = await initializeGraph();
            console.log("LangGraph 初始化成功");
            this.isInitialized = true;
        } catch (error) {
            console.error("LangGraph 初始化失败:", error);
            throw error;
        }
    }

    /**
     * 流式处理消息 - 唯一的消息处理方式
     */
    async *streamMessage(
        message: string,
        sessionId: string = "default"
    ): AsyncGenerator<string, void, unknown> {
        if (!this.isInitialized || !this.graph) {
            yield "LangGraph 未初始化";
            return;
        }

        try {
            console.log(`流式处理用户消息: ${message}`);

            const initialState: Partial<AgentState> = {
                messages: [new HumanMessage(message)],
                tripPlan: {},
                user_interaction_complete: true,
            };

            const config = {
                configurable: {
                    thread_id: sessionId,
                },
            };

            // 流式执行
            for await (const event of this.graph.stream(initialState, config)) {
                console.log("Stream event:", event);

                // 根据事件类型提取内容并流式返回
                if (event && typeof event === "object") {
                    const eventData = Object.values(event)[0] as any;
                    if (eventData?.messages?.length > 0) {
                        const lastMessage =
                            eventData.messages[eventData.messages.length - 1];
                        if (lastMessage?.content) {
                            yield lastMessage.content;
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error("流式处理消息时出错:", error);
            yield `流式处理错误: ${error.message}`;
        }
    }

    /**
     * 检查是否已准备就绪
     */
    isReady(): boolean {
        return this.isInitialized && this.graph !== null;
    }

    /**
     * 重置会话状态
     */
    async resetSession(sessionId: string): Promise<void> {
        // 这里可以实现清除特定会话的状态逻辑
        console.log(`重置会话: ${sessionId}`);
    }
}
