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
        let awaiting = false;
        let lastContent: string | null = null;
        try {
            const stream: any = await this.graph.stream(initialState, {
                ...config,
                streamMode: 'messages',
            });
            for await (const item of stream) {
                // LangGraph 新形式：可能是 [message, config] 或 state snapshot
                if (Array.isArray(item)) {
                    const msg = item[0] as BaseMessage;
                    if (!msg) continue;
                    let content: any = (msg as any).content;
                    if (Array.isArray(content)) {
                        content = content
                            .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
                            .join('');
                    }
                    if (typeof content !== 'string') continue;
                    const text = content.trim();
                    if (!text) continue;
                    if (text === message.trim()) continue;
                    if (lastContent && lastContent === text) continue;
                    lastContent = text;
                    yield text;
                } else if (item && typeof item === 'object') {
                    // 可能是最终状态快照（某些实现中提供）
                    const state = item as AgentState;
                    if ((state as any).awaiting_user) awaiting = true;
                }
            }
        } catch (e: any) {
            console.error('执行图时异常:', e);
            yield JSON.stringify({ error: 'EXECUTION_ERROR', message: e.message });
            return;
        }
        if (awaiting) {
            yield JSON.stringify({ type: 'interrupt', code: 'user_input_needed' });
        }
    }

    isReady(): boolean {
        return this.isInitialized && this.graph !== null;
    }

    async resume(message: string, sessionId = 'default'): Promise<string[]> {
        if (!this.isInitialized || !this.graph) throw new Error('NOT_INITIALIZED');
        // 仅附加新的用户消息继续执行，不重置状态
        const updates: Partial<AgentState> = {
            messages: [new HumanMessage(message)],
            awaiting_user: false,
        };
        const config = { configurable: { thread_id: sessionId }, streamMode: 'messages' } as any;
        const outputs: string[] = [];
        const stream: any = await this.graph.stream(updates, config);
        let lastContent: string | null = null;
        let awaiting = false;
        for await (const item of stream) {
            if (Array.isArray(item)) {
                const msg = item[0] as BaseMessage;
                if (!msg) continue;
                let content: any = (msg as any).content;
                if (Array.isArray(content)) {
                    content = content
                        .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
                        .join('');
                }
                if (typeof content !== 'string') continue;
                const text = content.trim();
                if (!text) continue;
                if (text === message.trim()) continue;
                if (lastContent && lastContent === text) continue;
                lastContent = text;
                outputs.push(text);
            } else if (item && typeof item === 'object') {
                const state = item as AgentState;
                if ((state as any).awaiting_user) awaiting = true;
            }
        }
        if (awaiting)
            outputs.push(JSON.stringify({ type: 'interrupt', code: 'user_input_needed' }));
        return outputs;
    }

    async *resumeStream(
        message: string,
        sessionId = 'default'
    ): AsyncGenerator<string, void, unknown> {
        if (!this.isInitialized || !this.graph) {
            yield JSON.stringify({ error: 'NOT_INITIALIZED' });
            return;
        }
        const updates: Partial<AgentState> = {
            messages: [new HumanMessage(message)],
            awaiting_user: false,
        };
        const config = { configurable: { thread_id: sessionId } };
        let awaiting = false;
        let lastContent: string | null = null;
        try {
            const stream: any = await this.graph.stream(updates, {
                ...config,
                streamMode: 'messages',
            });
            for await (const item of stream) {
                if (Array.isArray(item)) {
                    const msg = item[0] as BaseMessage;
                    if (!msg) continue;
                    let content: any = (msg as any).content;
                    if (Array.isArray(content)) {
                        content = content
                            .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
                            .join('');
                    }
                    if (typeof content !== 'string') continue;
                    const text = content.trim();
                    if (!text) continue;
                    if (text === message.trim()) continue; // 跳过用户原始输入回显
                    if (lastContent && lastContent === text) continue;
                    lastContent = text;
                    yield text;
                } else if (item && typeof item === 'object') {
                    const state = item as AgentState;
                    if ((state as any).awaiting_user) awaiting = true;
                }
            }
        } catch (e: any) {
            console.error('续执行图时异常:', e);
            yield JSON.stringify({ error: 'EXECUTION_ERROR', message: e.message });
            return;
        }
        if (awaiting) {
            yield JSON.stringify({ type: 'interrupt', code: 'user_input_needed' });
        }
    }
}
