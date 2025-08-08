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
    ): AsyncGenerator<string | object, void, unknown> {
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

            // 流式执行 - 等待 Promise 解析，使用 "messages" 模式获取更细粒度的流式输出
            const streamResult = await this.graph.stream(initialState, {
                ...config,
                streamMode: "messages" // 使用 messages 模式来捕获流式消息
            });
            
            for await (const event of streamResult) {
                console.log("Stream event:", JSON.stringify(event, null, 2));

                // LangGraph 事件格式: { "节点名": { 状态更新 } }
                if (event && typeof event === "object") {
                    // 遍历事件中的所有节点更新
                    for (const [nodeName, nodeUpdate] of Object.entries(event)) {
                        console.log(`处理节点 ${nodeName} 的更新:`, nodeUpdate);
                        
                        const update = nodeUpdate as any;
                        
                        // 检查是否有planTodos更新并发送状态数据
                        if (update?.planTodos && Array.isArray(update.planTodos)) {
                            console.log(`从节点 ${nodeName} 获取计划数据:`, update.planTodos);
                            yield {
                                type: 'state',
                                planTodos: update.planTodos,
                                nodeName: nodeName
                            };
                        }
                        
                        // 检查是否有新的消息
                        if (update?.messages && Array.isArray(update.messages)) {
                            for (const message of update.messages) {
                                if (message?.content && typeof message.content === 'string') {
                                    console.log(`从节点 ${nodeName} 获取内容:`, message.content);
                                    yield message.content;
                                }
                            }
                        }
                        
                        // 如果直接有内容字段
                        if (update?.content && typeof update.content === 'string') {
                            console.log(`从节点 ${nodeName} 获取直接内容:`, update.content);
                            yield update.content;
                        }
                    }
                }
            }
        } catch (error: any) {
            console.error("流式处理消息时出错:", error);
            yield `流式处理错误: ${error.message}`;
        }
    }

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
