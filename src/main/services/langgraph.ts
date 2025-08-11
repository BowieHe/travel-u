import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { initializeGraph } from './workflows/main-graph';
import { AgentState } from './utils/agent-type';
import { RunnableConfig } from '@langchain/core/runnables';

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

    async initialize(): Promise<void> {
        if (this.isInitialized) return;
        if (this.initializationPromise) return this.initializationPromise;
        this.initializationPromise = this.doInitialize();
        return this.initializationPromise;
    }

    private async doInitialize(): Promise<void> {
        try {
            console.log('初始化 LangGraph...');
            this.graph = await initializeGraph();
            console.log('LangGraph 初始化成功');
            this.isInitialized = true;
        } catch (e) {
            console.error('LangGraph 初始化失败:', e);
            throw e;
        }
    }

    /**
     * 流式执行：
     * - 仅输出每个节点最终 AIMessage（忽略 AIMessageChunk / 用户回显）
     * - 节点之间用单个换行分隔
     * - 连续重复内容去重
     */
    async *streamMessage(
        message: string,
        sessionId = 'default'
    ): AsyncGenerator<string, void, unknown> {
        if (!this.isInitialized || !this.graph) {
            yield JSON.stringify({ error: 'NOT_INITIALIZED' });
            return;
        }
        const initialState: Partial<AgentState> = {
            messages: [new HumanMessage(message)],
            user_interaction_complete: false,
        };
        const config = { configurable: { thread_id: sessionId } };
        let lastNode: string | null = null;
        let lastContent: string | null = null;
        try {
            const stream: AsyncIterable<[BaseMessage, RunnableConfig]> = await this.graph.stream(
                initialState,
                {
                    ...config,
                    streamMode: 'messages',
                }
            );
            for await (const item of stream) {
                const msg = item[0];
                const meta: any = item[1] || {};
                const nodeName: string = meta.langgraph_node || meta.name || '';
                if (!msg) continue;
                const ctor = (msg as any)?.constructor?.name;
                if (ctor === 'AIMessageChunk') continue; // 忽略增量块
                let content: any = (msg as any).content;
                if (Array.isArray(content)) {
                    content = content
                        .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
                        .join('');
                }
                if (typeof content !== 'string') continue;
                const text = content.trim();
                if (!text) continue;
                if (text === message.trim()) continue; // 跳过用户回显
                if (lastContent && text === lastContent) continue; // 去重相同内容
                if (nodeName && lastNode && nodeName !== lastNode) {
                    yield '\n';
                }
                lastNode = nodeName;
                // router JSON 后补换行
                if (/^\{"decision":/.test(text)) {
                    yield text + '\n';
                } else {
                    yield text;
                }
                lastContent = text;
            }
        } catch (e: any) {
            console.error('执行图时异常:', e);
            yield JSON.stringify({ error: 'EXECUTION_ERROR', message: e.message });
            return;
        }
    }

    isReady(): boolean {
        return this.isInitialized && this.graph !== null;
    }

    async resetSession(_sessionId: string): Promise<void> {
        // 暂无状态持久化，预留接口
    }
}
