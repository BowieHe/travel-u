import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { initializeGraph } from './workflows/main-graph';
import { AgentState } from './utils/agent-type';
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
            console.log('Graph state check:', {
                has_next: graphState?.next && graphState.next.length > 0,
                next_nodes: graphState?.next || [],
                is_completed: !graphState?.next || graphState?.next.length === 0,
                has_values: !!graphState?.values,
                stored_interrupts: graphState?.values?.interrupts // 检查存储的中断信息
            });

            let input: any;
            const hasNext = graphState?.next && graphState.next.length > 0;
            
            if (hasNext) {
                console.log('Detected graph interruption, attempting to resume...');
                console.log('Next nodes:', graphState?.next);
                
                // 根据 next 节点硬编码 interrupt ID
                const nextNodes = graphState.next;
                if (nextNodes.includes('wait_for_user')) {
                    // 如果下一个节点是 wait_for_user，使用固定的 interrupt ID
                    const resumeMap = {
                        'wait_for_user_input': message  // 硬编码的固定 ID
                    };
                    
                    input = new Command({ resume: resumeMap });
                    console.log('Using hardcoded resumeMap for wait_for_user:', resumeMap);
                } else if (graphState?.values?.interrupts && graphState.values.interrupts.length > 0) {
                    // 如果有存储的中断信息，使用它们
                    const resumeMap: Record<string, any> = {};
                    for (const interrupt of graphState.values.interrupts) {
                        resumeMap[interrupt.interrupt_id] = message;
                        console.log(`Using stored interrupt ${interrupt.interrupt_id}`);
                    }
                    input = new Command({ resume: resumeMap });
                } else {
                    // 其他情况使用简单的 resume
                    input = new Command({ resume: true });
                    console.log('Using simple resume for other nodes');
                }
            } else {
                console.log('Starting new conversation...');
                input = {
                    messages: [new HumanMessage(message)],
                    user_interaction_complete: false,
                };
            }

            const stream = await this.graph.stream(input, {
                ...config,
                streamMode: 'messages',
            });

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
                    if (text === message.trim()) continue; // 跳过用户输入回显
                    if (lastContent && lastContent === text) continue; // 去重
                    
                    lastContent = text;
                    yield text;
                } else if (item && typeof item === 'object') {
                    const state = item as AgentState;
                    if ((state as any).awaiting_user) awaiting = true;
                }
            }

            if (awaiting) {
                yield JSON.stringify({ type: 'interrupt', code: 'user_input_needed' });
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

    /**
     * Resume 方法 - 简化版本
     */
    async resumeMessage(message: string, sessionId = 'default'): Promise<void> {
        // 复用 streamMessage，但不返回生成器
        const stream = this.streamMessage(message, sessionId);
        for await (const chunk of stream) {
            // 这里可以处理输出，但主要目的是触发恢复
            console.log('Resume output chunk:', chunk);
        }
    }
}
