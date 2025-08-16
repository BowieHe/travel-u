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

    private constructor() { }

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
     * 支持思考模型的 additional_kwargs.reasoning_content 处理
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
                'planner'
            ];

            // 思考内容状态管理
            let hasOutputThinkingHeader = false;
            let hasOutputAnswerHeader = false;

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
                        const content: any = (msg as any).content;
                        const additionalKwargs = (msg as any).additional_kwargs || {};
                        // 检查是否是 planner 节点的输出
                        // const isPlannerNode = nodeName === 'planner';
                        const reasoningContent = additionalKwargs.reasoning_content;

                        // 调试日志
                        console.log('Processing AI message:', {
                            nodeName,
                            // isPlannerNode,
                            hasReasoningContent: !!reasoningContent,
                            hasContent: !!content,
                            contentType: typeof content,
                            contentLength: content ? content.length : 0
                        });


                        // 处理思考内容 (reasoning_content)
                        if (reasoningContent && typeof reasoningContent === 'string') {
                            if (!hasOutputThinkingHeader) {
                                yield '<reasoning>\n';
                                hasOutputThinkingHeader = true;
                            }
                            yield reasoningContent;
                        }

                        // 处理正文内容 (content)
                        if (content && typeof content === 'string') {
                            // if (isPlannerNode) {
                            //     // planner 节点的输出包装为 todo 标签
                            //     yield '<todo>\n';
                            //     yield content;
                            //     yield '\n</todo>';
                            // } else {
                            // 普通内容处理
                            // 如果之前输出了思考内容，需要关闭reasoning标签并开始content标签
                            if (hasOutputThinkingHeader && !hasOutputAnswerHeader) {
                                yield '\n</reasoning>\n\n<content>\n';
                                hasOutputAnswerHeader = true;
                            } else if (!hasOutputAnswerHeader) {
                                // 没有思考内容，直接开始content标签
                                yield '<content>\n';
                                hasOutputAnswerHeader = true;
                            }
                            yield content;
                            // }
                        }

                    } else if (mode === 'updates') {
                        // 处理 interrupt 更新
                        if (data && data.__interrupt__) {
                            const intr = data.__interrupt__[0];
                            const intrId = intr.interrupt_id;
                            if (!emittedInterruptIds.has(intrId)) {
                                emittedInterruptIds.add(intrId);
                            }
                        } else if (data.planner && data.planner.messages.length > 0) {
                            const plannerMsg = data.planner.messages[0]
                            yield '<todo>\n';
                            yield plannerMsg.content;
                            yield '\n</todo>';
                        }
                    }
                }
            }

            // 确保关闭所有打开的标签
            if (hasOutputAnswerHeader) {
                yield '\n</content>';
            } else if (hasOutputThinkingHeader) {
                yield '\n</reasoning>';
            }
            // 注意：planner 节点的 todo 标签已经在输出时关闭

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