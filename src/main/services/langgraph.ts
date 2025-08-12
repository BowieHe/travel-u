import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { initializeGraph } from './workflows/main-graph';
import { Command } from '@langchain/langgraph';

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

    isReady(): boolean {
        return this.isInitialized && this.graph !== null;
    }

    /**
     * 统一的流式处理方法
     */
    async *streamMessage(
        message: string,
        sessionId = 'default'
    ): AsyncGenerator<string, void, unknown> {
        if (!this.isInitialized || !this.graph) {
            yield JSON.stringify({ error: 'NOT_INITIALIZED' });
            return;
        }

        const config = { configurable: { thread_id: sessionId } };

        try {
            // 检查图的当前状态
            const graphState = await this.graph.getState(config);
            let input: any;

            if (graphState.tasks && graphState.tasks.length > 0 && graphState.tasks[0].interrupts) {
                const interrupts = graphState.tasks[0].interrupts;
                console.log('Current interrupts:', interrupts);

                input = new Command({ resume: message });
            } else {
                console.log('Starting new conversation...');
                input = {
                    messages: [new HumanMessage(message)],
                    user_interaction_complete: false,
                };
            }

            const stream = await this.graph.stream(input, {
                ...config,
                streamMode: ['messages', 'updates'],
            });

            let lastContent: string | null = null;

            for await (const item of stream) {
                if (Array.isArray(item)) {
                    const [mode, data] = item.length === 2 ? item : ['messages', item];

                    if (mode === 'messages') {
                        const msgArr = Array.isArray(data) ? data : [data];
                        const msg = msgArr[0] as BaseMessage;
                        // todo)) might could be deleted
                        let content: any = (msg as any).content;
                        if (Array.isArray(content)) {
                            content = content
                                .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
                                .join('');
                        }

                        const text = content.trim();
                        if (!text) continue;
                        if (text === message.trim()) continue; // 跳过用户输入回显
                        if (lastContent && lastContent === text) continue; // 去重

                        lastContent = text;
                        yield text;
                    } else {
                        // mode == update
                        // so far. only used to show interruption message, could be other node name if future
                        if (data.__interrupt__) {
                            // is interrupt
                            const message = data.__interrupt__[0].value.message;
                            if (message) {
                                yield message;
                            }
                        }
                    }
                } else if (item && typeof item === 'object') {
                    console.warn('item is object', item);
                }
            }
        } catch (e: any) {
            // 检查是否是中断异常
            if (e.name === 'NodeInterrupt' || e.message?.includes('interrupt')) {
                console.log('Graph execution interrupted, waiting for user input');
                yield JSON.stringify({ type: 'interrupt', code: 'user_input_needed' });
            } else {
                console.error('执行图时异常:', e);
                yield JSON.stringify({ error: 'EXECUTION_ERROR', message: e.message });
            }
        }
    }
}
