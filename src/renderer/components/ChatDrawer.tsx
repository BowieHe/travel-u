import React, { useState, useEffect, useRef } from 'react';
import {
    HelpCircle,
    RotateCcw,
    Settings,
    Sparkles,
    Send,
    ChevronsLeft,
    ChevronsRight,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { createChatAPI } from '@/main/ipc/chat-api';

interface SuggestionItem {
    id: string;
    text: string;
}

interface Message {
    id: string;
    content: string;
    sender: 'user' | 'ai';
    timestamp: Date;
    isLoading?: boolean;
}

//todo)) delete later
const mockMessages: Message[] = [
    // {
    //     id: 'a1',
    //     content: '你好！',
    //     sender: 'user',
    //     timestamp: new Date(),
    //     isLoading: true,
    // },
    // {
    //     id: 'a2',
    //     content:
    //         '{"thinking":"用户只是打招呼，可以直接回复，无需复杂规划。","direct_answer":"您好！我是您的旅行助手。有什么可以帮助您的吗？","plan":[]}',
    //     sender: 'ai',
    //     timestamp: new Date(),
    //     isLoading: true,
    // },
];
// 对话抽屉组件 - 完全基于HTML原型重新设计
export const ChatDrawer: React.FC<{
    isOpen: boolean;
    onToggle: () => void;
}> = ({ isOpen, onToggle }) => {
    const [inputMessage, setInputMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>(mockMessages); // 初始为空, 只显示建议
    const [isLoading, setIsLoading] = useState(false);
    const [awaitingUser, setAwaitingUser] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const suggestions: SuggestionItem[] = [
        { id: '1', text: '帮我总结当前页面的内容' },
        { id: '2', text: '比较北京和上海的旅游特色，用表格形式展示主要景点、美食和交通方式' },
        { id: '3', text: '访问故宫博物院官网，查询成人门票价格和购买方式' },
        { id: '4', text: '帮我制定一份3天2夜的杭州旅行攻略，包含西湖周边必游景点' },
        { id: '5', text: "请解释什么是'慢生活'旅行理念，并给出简要总结" },
    ];

    const handleSuggestionClick = (suggestion: SuggestionItem) => {
        sendMessage(suggestion.text);
    };

    const handleApprove = () => {
        sendMessage(JSON.stringify({ approved: true }));
    };

    const sendMessage = async (messageContent?: string) => {
        if ((inputMessage.trim() === '' || isLoading) && !messageContent) return;
        const chatAPI = createChatAPI();

        const sendMsg = messageContent ? messageContent : inputMessage.trim();
        console.log('Send msg:', sendMsg);
        const userMessage: Message = {
            id: Date.now().toString(),
            content: sendMsg,
            sender: 'user',
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
        const currentMessage = sendMsg;
        setInputMessage('');
        setIsLoading(true);

        const aiMessageId = (Date.now() + 1).toString();
        const aiMessage: Message = {
            id: aiMessageId,
            content: '',
            sender: 'ai',
            timestamp: new Date(),
            isLoading: true,
        };
        setMessages((prev) => [...prev, aiMessage]);

        try {
            let fullResponse = '';
            chatAPI.onMessage((chunk: string) => {
                // // 尝试解析 interrupt JSON
                // try {
                //     const obj = JSON.parse(chunk);
                //     if (obj && obj.type === 'interrupt') {
                //         console.log('Received interrupt, setting awaiting user state', obj);
                //         setAwaitingUser(true);
                //         setIsLoading(false);
                //         return; // 不把中断对象显示为文本
                //     }
                // } catch {}
                fullResponse += chunk;
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === aiMessageId
                            ? { ...msg, content: fullResponse, isLoading: false }
                            : msg
                    )
                );
            });
            chatAPI.onComplete(() => {
                setIsLoading(false);
                if (!awaitingUser) setAwaitingUser(false); // 正常完成清除等待
                setMessages((prev) =>
                    prev.map((msg) => (msg.id === aiMessageId ? { ...msg, isLoading: false } : msg))
                );
                chatAPI.cleanup();
            });
            chatAPI.onError((error: string) => {
                setIsLoading(false);
                setAwaitingUser(false); // 错误时清除等待状态
                setMessages((prev) =>
                    prev.map((msg) =>
                        msg.id === aiMessageId
                            ? {
                                  ...msg,
                                  content: `抱歉，我遇到了一个错误: ${error}`,
                                  isLoading: false,
                              }
                            : msg
                    )
                );
                chatAPI.cleanup();
            });

            // 简化：始终使用 streamMessage，它内部会自动处理 resume 逻辑
            console.log('Sending message (auto-resume if needed):', currentMessage);
            if (awaitingUser) {
                console.log('Was awaiting user, clearing awaiting state');
                setAwaitingUser(false);
            }
            await chatAPI.streamMessage(currentMessage);
        } catch (error) {
            console.error('发送消息失败:', error);
            setIsLoading(false);
            setAwaitingUser(false); // 错误时清除等待状态
            setMessages((prev) =>
                prev.map((msg) =>
                    msg.id === aiMessageId
                        ? {
                              ...msg,
                              content: '抱歉，我遇到了一个错误，请稍后重试。',
                              isLoading: false,
                          }
                        : msg
                )
            );
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // 分段式解析函数 - 支持 XML 标签和 Markdown 格式
    const parseStreamingSections = (content: string) => {
        const result = {
            thinking: '',
            answer: '',
            plan: '',
            current: 'answer', // 默认类型
        };

        // 尝试解析JSON格式（向后兼容）
        try {
            const parsed = JSON.parse(content);
            if (typeof parsed === 'object' && parsed) {
                result.thinking = parsed.thinking || '';
                result.answer = parsed.direct_answer || '';
                result.plan = parsed.plan
                    ? parsed.plan.map((item: any) => `- [ ] ${item.description || item}`).join('\n')
                    : '';
                return result;
            }
        } catch {
            // 不是JSON，继续其他解析
        }

        // 尝试解析XML标签格式
        const reasoningMatch = content.match(/<reasoning>([\s\S]*?)<\/reasoning>/);
        const contentMatch = content.match(/<content>([\s\S]*?)<\/content>/);
        const todoMatch = content.match(/<todo>([\s\S]*?)<\/todo>/);

        if (reasoningMatch || contentMatch || todoMatch) {
            result.thinking = reasoningMatch ? reasoningMatch[1].trim() : '';
            result.answer = contentMatch ? contentMatch[1].trim() : '';

            // 特殊处理todo标签中的JSON内容
            if (todoMatch) {
                let todoContent = todoMatch[1].trim();
                console.log('Found todo content:', todoContent);

                // 检查是否是markdown格式的JSON代码块
                const jsonCodeBlockMatch = todoContent.match(/```json\s*([\s\S]*?)\s*```/);
                if (jsonCodeBlockMatch) {
                    todoContent = jsonCodeBlockMatch[1].trim();
                    console.log('Extracted JSON from code block:', todoContent);
                }

                try {
                    // 尝试解析JSON并直接传递给plan字段
                    const parsed = JSON.parse(todoContent);
                    result.plan = JSON.stringify(parsed); // 确保是字符串格式，供PlanSection进一步处理
                    console.log('Parsed todo as JSON:', parsed);
                } catch (e) {
                    // 如果不是JSON，直接使用原内容
                    result.plan = todoContent;
                    console.log('Todo content is not JSON, using as-is:', todoContent);
                }
            }

            // 确定当前渲染的部分
            if (todoMatch) result.current = 'plan';
            else if (contentMatch) result.current = 'answer';
            else if (reasoningMatch) result.current = 'thinking';

            console.log('XML parsing result:', {
                thinking: result.thinking,
                answer: result.answer,
                plan: result.plan,
                current: result.current,
            });
            return result;
        }

        // // 分段解析markdown（向后兼容）
        // const sections = content.split(/^## (🤔 思考|📝 回答|📋 计划)/m);

        // for (let i = 1; i < sections.length; i += 2) {
        //     const sectionType = sections[i];
        //     const sectionContent = (sections[i + 1] || '').trim();

        //     if (sectionType.includes('思考')) {
        //         result.thinking = sectionContent;
        //         result.current = 'thinking';
        //     } else if (sectionType.includes('回答')) {
        //         result.answer = sectionContent;
        //         result.current = 'answer';
        //     } else if (sectionType.includes('计划')) {
        //         result.plan = sectionContent;
        //         result.current = 'plan';
        //     }
        // }

        // 如果没有明确section，归到answer
        if (!result.thinking && !result.answer && !result.plan) {
            result.answer = content;
        }

        return result;
    };

    // 思考内容组件 - 支持折叠/展开
    const ThinkingSection: React.FC<{ content: string }> = ({ content }) => {
        const [isExpanded, setIsExpanded] = useState(false);

        if (!content) return null;

        return (
            <div className="mb-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors rounded-lg"
                >
                    <div className="text-xs font-medium tracking-wide text-blue-600 dark:text-blue-400 uppercase">
                        🤔 思考过程
                    </div>
                    <div className="text-blue-600 dark:text-blue-400 ml-2 flex-shrink-0">
                        {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </div>
                </button>

                {isExpanded && (
                    <div className="px-3 pb-3 text-sm text-blue-700 dark:text-blue-300 markdown-body">
                        <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                )}
            </div>
        );
    };

    // 回答内容组件
    const AnswerSection: React.FC<{ content: string }> = ({ content }) => {
        if (!content) return null;
        return (
            <div className="markdown-body text-[14.5px] leading-[1.55] tracking-[0.2px] whitespace-pre-wrap [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown>{content}</ReactMarkdown>
            </div>
        );
    };

    // 计划内容组件 - 支持 JSON 格式解析
    const PlanSection: React.FC<{ content: string }> = ({ content }) => {
        if (!content) return null;

        console.log('PlanSection received content:', content);

        // 尝试解析 JSON 格式的任务列表
        let tasks: Array<{ description: string; category: string; priority: string }> = [];

        try {
            const parsed = JSON.parse(content);
            console.log('PlanSection parsed JSON:', parsed);
            if (Array.isArray(parsed)) {
                // 新格式：直接是任务数组
                tasks = parsed;
                console.log('Using direct array format:', tasks);
            } else if (parsed.tasks && Array.isArray(parsed.tasks)) {
                // 旧格式：包装在 tasks 字段中（向后兼容）
                tasks = parsed.tasks;
                console.log('Using legacy tasks format:', tasks);
            }
        } catch (e) {
            console.log('JSON parsing failed, trying markdown format:', e);
            // 如果不是 JSON，尝试解析为 markdown 格式的任务列表
            const lines = content.split('\n').filter((line) => line.trim().startsWith('- [ ]'));
            tasks = lines.map((line) => {
                const text = line.replace('- [ ]', '').trim();
                // 尝试提取分类和优先级
                const categoryMatch = text.match(/\(分类:\s*(\w+)/);
                const priorityMatch = text.match(/优先级:\s*(\w+)\)/);

                return {
                    description: text.replace(/\s*\([^)]*\)\s*$/, '').trim(),
                    category: categoryMatch ? categoryMatch[1] : 'other',
                    priority: priorityMatch ? priorityMatch[1] : 'medium',
                };
            });
        }

        console.log('Final tasks array:', tasks);
        if (tasks.length === 0) {
            console.log('No tasks found, returning null');
            return null;
        }

        const getCategoryIcon = (category: string) => {
            switch (category) {
                case 'research':
                    return '🔍';
                case 'booking':
                    return '📝';
                case 'transportation':
                    return '🚗';
                case 'accommodation':
                    return '🏨';
                case 'activity':
                    return '🎯';
                default:
                    return '📋';
            }
        };

        const getPriorityColor = (priority: string) => {
            switch (priority) {
                case 'high':
                    return 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20';
                case 'medium':
                    return 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20';
                case 'low':
                    return 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20';
                default:
                    return 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/20';
            }
        };

        const getPriorityTextColor = (priority: string) => {
            switch (priority) {
                case 'high':
                    return 'text-red-700 dark:text-red-300';
                case 'medium':
                    return 'text-yellow-700 dark:text-yellow-300';
                case 'low':
                    return 'text-green-700 dark:text-green-300';
                default:
                    return 'text-gray-700 dark:text-gray-300';
            }
        };

        return (
            <div className="mt-3 space-y-2">
                <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                    📋 计划清单
                </div>
                <div className="space-y-2">
                    {tasks.map((task, index) => (
                        <div
                            key={index}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-[13px] leading-snug backdrop-blur-sm ${getPriorityColor(
                                task.priority
                            )}`}
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 accent-travel-primary cursor-pointer flex-shrink-0"
                                disabled
                            />
                            <div className="flex-1 min-w-0">
                                <div
                                    className={`font-medium ${getPriorityTextColor(task.priority)}`}
                                >
                                    {task.description}
                                </div>
                                <div className="flex items-center gap-2 mt-1 text-xs opacity-75">
                                    <span className="flex items-center gap-1">
                                        {getCategoryIcon(task.category)}
                                        {task.category}
                                    </span>
                                    <span className="w-1 h-1 bg-current rounded-full"></span>
                                    <span
                                        className={`font-medium ${
                                            task.priority === 'high'
                                                ? 'text-red-600 dark:text-red-400'
                                                : task.priority === 'medium'
                                                ? 'text-yellow-600 dark:text-yellow-400'
                                                : 'text-green-600 dark:text-green-400'
                                        }`}
                                    >
                                        {task.priority === 'high'
                                            ? '高优先级'
                                            : task.priority === 'medium'
                                            ? '中优先级'
                                            : '低优先级'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <div>
                    <button
                        className="text-left px-4 py-3 hover:bg-black/5 focus:bg-black/5 focus:outline-none group transition-colors"
                        onClick={handleApprove}
                    >
                        Approve
                    </button>
                </div>
            </div>
        );
    };

    return (
        <>
            {/* 外层抽屉容器 */}
            <div
                className={`fixed right-0 top-0 h-full w-[min(40%,_640px)] transition-transform duration-300 ease-in-out z-50 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* 主体盒子 */}
                <div className="chat-panel flex flex-col overflow-hidden rounded-2xl bg-brand-surface shadow-[0_8px_28px_rgba(0,0,0,0.08)] font-app backdrop-blur supports-[backdrop-filter]:bg-brand-surface/95">
                    {/* 头部 */}
                    <header className="flex justify-between items-center flex-shrink-0 py-4 px-5">
                        <div className="flex">
                            <button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-80 text-brand-icon/80 hover:text-brand-icon">
                                <HelpCircle size={20} />
                            </button>
                        </div>
                        <div className="flex gap-4">
                            <button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-80 text-brand-icon/80 hover:text-brand-icon">
                                <RotateCcw size={20} />
                            </button>
                            <button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-80 text-brand-icon/80 hover:text-brand-icon">
                                <Settings size={20} />
                            </button>
                            <div className="w-6 h-6 rounded-full cursor-pointer from-brand-gradientFrom to-brand-gradientTo bg-[linear-gradient(135deg,var(--tw-gradient-from),var(--tw-gradient-to))] shadow-inner" />
                        </div>
                    </header>

                    {/* 主内容区 */}
                    <main className="flex-1 overflow-y-auto px-6 pb-4 scroll-smooth">
                        {messages.length === 0 ? (
                            <div className="mt-3 rounded-xl border border-brand-divider/70 bg-white/60 backdrop-blur-sm shadow-sm overflow-hidden divide-y divide-brand-divider/60">
                                {suggestions.map((s) => (
                                    <button
                                        key={s.id}
                                        type="button"
                                        onClick={() => handleSuggestionClick(s)}
                                        className="w-full text-left px-4 py-3 hover:bg-black/5 focus:bg-black/5 focus:outline-none group transition-colors"
                                    >
                                        <span className="block text-[14.5px] leading-[1.55] tracking-[0.2px] text-brand-icon/70 group-hover:text-brand-icon">
                                            {s.text}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-5 py-5">
                                {messages.map((message) => {
                                    if (message.sender === 'user') {
                                        return (
                                            <div
                                                key={message.id}
                                                className="flex gap-3 ml-auto flex-row-reverse max-w-[80%]"
                                            >
                                                <div className="group relative rounded-2xl px-4 py-3 shadow-sm transition-all animate-chat-in bg-travel-primary text-white hover:shadow-md">
                                                    <div className="text-[14.5px] leading-[1.55] tracking-[0.2px] whitespace-pre-wrap">
                                                        {message.content}
                                                    </div>
                                                    <span className="absolute -bottom-4 right-1 text-[10px] font-medium tracking-wide italic transition-opacity select-none pointer-events-none text-gray-400 dark:text-brand-darkIcon/60">
                                                        {message.timestamp.toLocaleTimeString([], {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    }

                                    // AI消息使用分段式渲染
                                    const sections = parseStreamingSections(message.content);
                                    return (
                                        <div key={message.id} className="flex gap-3 max-w-[85%]">
                                            <div className="group relative rounded-2xl px-4 py-3 shadow-sm transition-all animate-chat-in bg-travel-light/90 border border-brand-divider/70 text-gray-700 dark:bg-brand-darkSurface/70 dark:border-brand-darkBorder dark:text-brand-darkIcon hover:shadow-md">
                                                <ThinkingSection content={sections.thinking} />
                                                <AnswerSection content={sections.answer} />
                                                <PlanSection content={sections.plan} />
                                                <span className="absolute -bottom-4 right-1 text-[10px] font-medium tracking-wide italic transition-opacity select-none pointer-events-none text-gray-400 dark:text-brand-darkIcon/60">
                                                    {message.timestamp.toLocaleTimeString([], {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </main>

                    {/* 输入区 */}
                    <footer className="mt-auto px-6 pt-3 pb-5">
                        {awaitingUser && (
                            <div className="mb-3 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                                    <span className="text-sm text-blue-700 dark:text-blue-300">
                                        系统正在等待您的回复...
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="flex flex-col bg-brand-surface border border-brand-border rounded-[12px] p-3 h-[104px] transition-all focus-within:border-brand-icon focus-within:shadow-[0_0_0_2px_rgba(140,140,106,0.2)]">
                            <textarea
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="你想要做什么？"
                                className="flex-grow bg-transparent outline-none border-none text-[15px] text-brand-icon/70 px-2 placeholder:text-brand-icon/40 resize-none"
                            />
                            <div className="flex items-center justify-between mt-2">
                                <button
                                    type="button"
                                    className="p-0 bg-transparent border-none cursor-pointer text-brand-icon/80 transition-opacity hover:opacity-90"
                                >
                                    <Sparkles size={20} />
                                </button>
                                <button
                                    onClick={() => sendMessage()}
                                    disabled={inputMessage.trim() === '' || isLoading}
                                    className={`p-0 bg-transparent border-none cursor-pointer text-brand-icon/80 transition-opacity ${
                                        inputMessage.trim() === '' || isLoading
                                            ? 'opacity-50 cursor-not-allowed'
                                            : 'hover:opacity-90'
                                    }`}
                                >
                                    <Send size={20} />
                                </button>
                            </div>
                        </div>
                    </footer>
                </div>

                {/* 收缩按钮 */}
                {isOpen && (
                    <button
                        onClick={onToggle}
                        className="absolute top-1/2 left-0 -translate-x-full -translate-y-1/2 w-9 h-14 bg-brand-surface/90 border border-brand-border/70 rounded-l-xl hover:bg-brand-surface transition-colors shadow-sm flex items-center justify-center backdrop-blur-sm"
                        title="收起对话"
                    >
                        <ChevronsRight size={16} className="text-brand-icon/70" />
                    </button>
                )}
            </div>

            {/* 展开按钮 */}
            {!isOpen && (
                <button
                    onClick={onToggle}
                    className="fixed top-1/2 right-0 -translate-y-1/2 w-9 h-14 bg-brand-surface/90 border border-brand-border/70 rounded-l-xl hover:bg-brand-surface transition-colors shadow-sm flex items-center justify-center z-40 backdrop-blur-sm"
                    title="打开对话"
                >
                    <ChevronsLeft size={16} className="text-brand-icon/70" />
                </button>
            )}
        </>
    );
};
