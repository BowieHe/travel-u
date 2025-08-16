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
     * 支持思考模型的 part.thought 和 part.text 处理
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
                };
            }

            const stream = await this.graph.stream(input, {
                ...config,
                streamMode: ['messages', 'updates'],
            });

            // 状态控制
            const emittedInterruptIds = new Set<string>();
            const suppressNodes: string[] = [
                'router',
                'trip_plan_summary',
                'process_response',
                'ask_subgraph',
            ];
            
            // 思考内容状态管理
            let isInThinkingMode = false;
            let hasOutputThinkingHeader = false;

            for await (const item of stream) {
                if (Array.isArray(item)) {
                    const [mode, data] = item.length === 2 ? item : ['messages', item];
                    if (mode === 'messages') {
                        const msgArr = Array.isArray(data) ? data : [data];
                        const msg = msgArr[0] as BaseMessage;
                        const meta = (msgArr[1] as any) || {};
                        const nodeName: string = meta.langgraph_node || meta.name || '';
                        
                        if (suppressNodes.includes(nodeName)) continue;

                        const ctor = (msg as any)?.constructor?.name;
                        if (ctor === 'HumanMessage') continue;
                        
                        // 处理AI消息内容
                        let content: any = (msg as any).content;
                        
                        // 检查是否是思考模型的响应格式（包含 parts 数组）
                        if (Array.isArray(content)) {
                            for (const part of content) {
                                if (part.thought) {
                                    // 这是思考内容 - 类似伪代码中的 part.thought
                                    if (!hasOutputThinkingHeader) {
                                        yield '## 🤔 思考\n';
                                        hasOutputThinkingHeader = true;
                                        isInThinkingMode = true;
                                    }
                                    yield part.text || '';
                                } else if (part.text) {
                                    // 这是正常回答内容 - 类似伪代码中的 part.text
                                    if (isInThinkingMode) {
                                        // 思考结束，开始回答
                                        yield '\n\n## 📝 回答\n';
                                        isInThinkingMode = false;
                                    }
                                    yield part.text;
                                }
                            }
                        } else {
                            // 处理普通字符串内容（非思考模型）
                            if (typeof content === 'string') {
                                if (ctor === 'AIMessage') yield '\n';
                                yield content;
                            }
                        }
                    } else if (mode === 'updates') {
                        // 处理 interrupt 更新
                        if (data && data.__interrupt__) {
                            const intr = data.__interrupt__[0];
                            const intrId = intr.interrupt_id;
                            if (!emittedInterruptIds.has(intrId)) {
                                emittedInterruptIds.add(intrId);
                            }
                        }
                    }
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