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
                };
            }

            const stream = await this.graph.stream(input, {
                ...config,
                streamMode: ['messages', 'updates'],
            });

            // 状态控制
            // const emittedMessageIds = new Set<string>();
            const emittedInterruptIds = new Set<string>();
            // const nodeStarted = new Set<string>(); // 记录某节点是否已输出过（用于插入换行）
            // const nodeBuffers: Record<string, { acc: string; finalEmitted: boolean }> = {};
            // let lastNode: string | null = null;
            // let lastGlobalText: string | null = null; // 最后一次输出的文本（跨节点）
            // const userEcho = message.trim();
            const suppressNodes: string[] = [
                'router',
                'trip_plan_summary',
                'process_response',
                'ask_subgraph',
            ]; // 需要完全隐藏的节点
            const noChunkNodes = new Set<string>(['ask_user']); // 对这些节点只输出最终消息，避免重复（如两行问句）

            for await (const item of stream) {
                if (Array.isArray(item)) {
                    const [mode, data] = item.length === 2 ? item : ['messages', item];
                    if (mode === 'messages') {
                        const msgArr = Array.isArray(data) ? data : [data];
                        const msg = msgArr[0] as BaseMessage;
                        const meta = (msgArr[1] as any) || {};
                        const nodeName: string = meta.langgraph_node || meta.name || '';
                        if (suppressNodes.includes(nodeName)) continue;
                        // if (!msg) continue;
                        const ctor = (msg as any)?.constructor?.name;
                        if (ctor === 'HumanMessage') continue;
                        if (ctor === 'AIMessage') yield '\n';
                        let content: any = (msg as any).content;
                        if (Array.isArray(content)) {
                            content = content
                                .map((c: any) => (typeof c === 'string' ? c : c?.text || ''))
                                .join('');
                        }
                        if (typeof content !== 'string') continue;
                        // const text = content;
                        yield content;
                        // // 跳过空/纯空白
                        // if (!text || !text.trim()) continue;
                        // // 跳过用户输入回显
                        // if (text.trim() === userEcho) continue;

                        // // 初始化 buffer
                        // nodeBuffers[nodeName] = nodeBuffers[nodeName] || {
                        //     acc: '',
                        //     finalEmitted: false,
                        // };

                        // if (ctor === 'AIMessageChunk') {
                        //     // 若该节点配置为不输出增量，则仅记录，不发送
                        //     if (noChunkNodes.has(nodeName)) {
                        //         nodeBuffers[nodeName].acc = nodeBuffers[nodeName].acc + text;
                        //         continue;
                        //     }
                        //     // 处理可能是“累计全文”型 chunk（每次返回迄今为止的全部）
                        //     const prev = nodeBuffers[nodeName].acc;
                        //     let delta = text;
                        //     if (prev && text.startsWith(prev)) {
                        //         delta = text.slice(prev.length); // 仅新增部分
                        //     }
                        //     // 更新缓冲为当前完整内容（而不是追加，避免指数增长）
                        //     nodeBuffers[nodeName].acc = text;
                        //     if (!nodeStarted.has(nodeName)) {
                        //         if (lastNode && lastNode !== nodeName) {
                        //             yield '\n';
                        //         }
                        //         nodeStarted.add(nodeName);
                        //         lastNode = nodeName;
                        //     }
                        //     if (delta) {
                        //         // 避免输出空 delta
                        //         yield delta;
                        //         lastGlobalText = delta; // 更新最近输出用于跨节点重复检测（虽意义有限）
                        //     }
                        //     continue;
                        // }

                        // // 最终 AIMessage：若之前已经发过增量且最终内容等于累积，避免重复整体重发
                        // const finalText = text.trim();
                        // const bufferAcc = nodeBuffers[nodeName].acc.trim();
                        // if (!nodeStarted.has(nodeName)) {
                        //     if (lastNode && lastNode !== nodeName) {
                        //         yield '\n';
                        //     }
                        //     nodeStarted.add(nodeName);
                        //     lastNode = nodeName;
                        // }
                        // const mid: string | undefined = (msg as any).id;
                        // if (mid && emittedMessageIds.has(mid)) continue;
                        // // 归一化换行差异（模型最终输出添加了换行导致重复）
                        // const stripNl = (s: string) => s.replace(/\n/g, '');
                        // if (
                        //     bufferAcc &&
                        //     (finalText === bufferAcc ||
                        //         finalText === bufferAcc + '\n' ||
                        //         stripNl(finalText) === stripNl(bufferAcc))
                        // ) {
                        //     // 已经通过块完整输出过，标记但不再重复
                        //     if (mid) emittedMessageIds.add(mid);
                        //     nodeBuffers[nodeName].finalEmitted = true;
                        //     continue;
                        // }
                        // let outText = finalText;
                        // // ask_user 结果规范化：去重、多余合并、限制为两行
                        // if (nodeName === 'ask_user') {
                        //     // 1. 去掉意外包裹的 Markdown 反引号
                        //     outText = outText.replace(/```+/g, '').trim();
                        //     // 2. 若出现两次“已知：”且内容重复，压缩
                        //     const dupPattern = /^(已知：[^\n]+?)(?:\1)([\s\S]+)$/;
                        //     outText = outText.replace(dupPattern, (_, a, b) => `${a}\n${b.trim()}`);
                        //     // 3. 若只有一行但包含“已知：”和问句（含“？/?”），尝试拆两行（依据最后一个问号前的问句部分）
                        //     if (!/\n/.test(outText)) {
                        //         const qIndex = outText.indexOf('？');
                        //         if (qIndex > -1) {
                        //             // 尝试在第一个问号后切分（如果前面含“已知：”且后面还有字）
                        //             const firstPart = outText.slice(0, qIndex + 1);
                        //             const rest = outText.slice(qIndex + 1).trim();
                        //             if (rest) outText = `${firstPart}\n${rest}`;
                        //         }
                        //     }
                        //     // 4. 限制为两行
                        //     const lines = outText
                        //         .split(/\n+/)
                        //         .map((l) => l.trim())
                        //         .filter(Boolean);
                        //     if (lines.length > 2) outText = lines.slice(0, 2).join('\n');
                        //     // 5. 再次去除首尾多余空白
                        //     outText = outText.trim();
                        // }

                        // // 如果与上一条全局输出完全相同，则跳过
                        // if (outText && lastGlobalText && outText === lastGlobalText) {
                        //     if (mid) emittedMessageIds.add(mid);
                        //     nodeBuffers[nodeName].finalEmitted = true;
                        //     continue;
                        // }

                        // // router JSON 后补换行
                        // if (/^\{"decision":/.test(outText)) {
                        //     yield outText + '\n';
                        // } else {
                        //     yield outText;
                        // }
                        // lastGlobalText = outText;
                        // nodeBuffers[nodeName].finalEmitted = true;
                        // if (mid) emittedMessageIds.add(mid);
                    } else if (mode === 'updates') {
                        // 处理 interrupt 更新
                        if (data && data.__interrupt__) {
                            const intr = data.__interrupt__[0];
                            const intrId = intr.interrupt_id;
                            if (!emittedInterruptIds.has(intrId)) {
                                const intrMsg = intr.value?.message?.trim();
                                if (intrMsg) {
                                    // 输出一次中断提示
                                    // duplicate output
                                    // yield intrMsg;
                                }
                                emittedInterruptIds.add(intrId);
                            }
                        }
                    }
                } else if (item && typeof item === 'object') {
                    // 预防性日志（可在稳定后移除）
                    // console.warn('Unexpected stream item object', item);
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
