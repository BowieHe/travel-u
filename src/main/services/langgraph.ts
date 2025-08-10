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

    private constructor() { }

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
            yield JSON.stringify({ error: "NOT_INITIALIZED" });
            return;
        }
        console.log(`流式处理用户消息(统一聚合): ${message}`);
        const initialState: Partial<AgentState> = {
            messages: [new HumanMessage(message)],
            tripPlan: {},
            user_interaction_complete: true,
        };
        const config = { configurable: { thread_id: sessionId } };

        let finalJsonCandidate: string | null = null;
        try {
            const streamResult = await this.graph.stream(initialState, {
                ...config,
                streamMode: "messages",
            });
            for await (const event of streamResult) {
                if (event && typeof event === "object") {
                    for (const [, nodeUpdate] of Object.entries(event)) {
                        const update = nodeUpdate as any;
                        if (update?.messages && Array.isArray(update.messages)) {
                            for (const m of update.messages) {
                                if (m?.content && typeof m.content === "string") {
                                    // 只保留最新一条（期望 orchestrator 已输出规范 JSON）
                                    finalJsonCandidate = m.content;
                                }
                            }
                        } else if (update?.content && typeof update.content === "string") {
                            finalJsonCandidate = update.content;
                        }
                    }
                }
            }
        } catch (err: any) {
            console.error("执行图时异常:", err);
            yield JSON.stringify({ error: "EXECUTION_ERROR", message: err.message });
            return;
        }

        if (!finalJsonCandidate) {
            console.warn("未捕获到 orchestrator 输出，返回降级 JSON");
            yield JSON.stringify({ direct_answer: "暂无响应" });
            return;
        }

        // 尝试校验是否为 JSON；若不是则包装为 direct_answer
        let parsed: any;
        try {
            parsed = JSON.parse(finalJsonCandidate);
        } catch {
            yield JSON.stringify({ direct_answer: finalJsonCandidate });
            return;
        }

        // 这里不强行重写结构，只原样返回（假设 orchestrator 已保证符合 PLAN_JSON_SCHEMA）
        yield JSON.stringify(parsed);
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
