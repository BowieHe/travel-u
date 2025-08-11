import React, { useState, useEffect, useRef } from 'react';
import {
    HelpCircle,
    RotateCcw,
    Settings,
    Sparkles,
    Send,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react';
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
    {
        id: 'a1',
        content: '你好！',
        sender: 'user',
        timestamp: new Date(),
        isLoading: true,
    },
    {
        id: 'a2',
        content:
            '{"thinking":"用户只是打招呼，可以直接回复，无需复杂规划。","direct_answer":"您好！我是您的旅行助手。有什么可以帮助您的吗？","plan":[]}',
        sender: 'ai',
        timestamp: new Date(),
        isLoading: true,
    },
];
// 对话抽屉组件 - 完全基于HTML原型重新设计
export const ChatDrawer: React.FC<{
    isOpen: boolean;
    onToggle: () => void;
}> = ({ isOpen, onToggle }) => {
    const [inputMessage, setInputMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>(mockMessages); // 初始为空, 只显示建议
    const [isLoading, setIsLoading] = useState(false);
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
        setInputMessage(suggestion.text);
    };

    const sendMessage = async () => {
        if (inputMessage.trim() === '' || isLoading) return;
        const chatAPI = createChatAPI();
        const userMessage: Message = {
            id: Date.now().toString(),
            content: inputMessage,
            sender: 'user',
            timestamp: new Date(),
        };
        setMessages((prev) => [...prev, userMessage]);
        const currentMessage = inputMessage;
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
                console.log('get content from chatAPI.onMessage', chunk);
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
                setMessages((prev) =>
                    prev.map((msg) => (msg.id === aiMessageId ? { ...msg, isLoading: false } : msg))
                );
                chatAPI.cleanup();
            });
            chatAPI.onError((error: string) => {
                setIsLoading(false);
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
            await chatAPI.streamMessage(currentMessage);
        } catch (error) {
            console.error('发送消息失败:', error);
            setIsLoading(false);
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

    const parseMessageContent = (content: string) => {
        try {
            const parsed = JSON.parse(content);
            if (typeof parsed === 'object' && parsed) {
                return {
                    thinking: parsed.thinking || '',
                    directAnswer: parsed.direct_answer || '',
                    plan: Array.isArray(parsed.plan) ? parsed.plan : [],
                    raw: parsed,
                };
            }
        } catch (error) {
            return { thinking: '', directAnswer: content, plan: [], raw: null };
        }
        return { thinking: '', directAnswer: content, plan: [], raw: null };
    };

    const PlanBlock: React.FC<{ plan: any[] }> = ({ plan }) => {
        if (!plan || plan.length === 0) return null;
        return (
            <div className="mt-3 space-y-2">
                <div className="text-xs font-medium tracking-wide text-gray-500 uppercase">
                    计划
                </div>
                <ul className="space-y-1">
                    {plan.map((item, idx) => (
                        <li
                            key={idx}
                            className="flex items-start gap-2 rounded-lg bg-white/60 dark:bg-white/10 border border-brand-divider/50 px-2 py-1.5 text-[13px] leading-snug backdrop-blur-sm"
                        >
                            <input
                                type="checkbox"
                                className="mt-0.5 accent-travel-primary cursor-pointer"
                                disabled
                            />
                            <div className="flex-1 min-w-0">
                                <div className="truncate font-medium text-gray-700 dark:text-gray-200">
                                    {item.description || '未提供描述'}
                                </div>
                                <div className="text-[11px] text-gray-400 mt-0.5 flex gap-3">
                                    {item.category && <span>分类: {item.category}</span>}
                                    {item.priority && <span>优先级: {item.priority}</span>}
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
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
                                    const { thinking, directAnswer, plan } = parseMessageContent(
                                        message.content
                                    );
                                    return (
                                        <div
                                            key={message.id}
                                            className={`flex gap-3 ${
                                                message.sender === 'user'
                                                    ? 'ml-auto flex-row-reverse max-w-[80%]'
                                                    : 'max-w-[85%]'
                                            }`}
                                        >
                                            <div
                                                className={`group relative rounded-2xl px-4 py-3 shadow-sm transition-all animate-chat-in ${
                                                    message.sender === 'user'
                                                        ? 'bg-travel-primary text-white'
                                                        : 'bg-travel-light/90 border border-brand-divider/70 text-gray-700 dark:bg-brand-darkSurface/70 dark:border-brand-darkBorder dark:text-brand-darkIcon'
                                                } hover:shadow-md`}
                                            >
                                                {thinking && (
                                                    <div className="text-xs text-gray-500 mb-2 space-y-1 font-semibold">
                                                        <strong className="font-semibold">
                                                            思考:
                                                        </strong>{' '}
                                                        {thinking}
                                                    </div>
                                                )}
                                                {directAnswer && (
                                                    <div className="markdown-body text-[14.5px] leading-[1.55] tracking-[0.2px] whitespace-pre-wrap [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                                                        {directAnswer}
                                                    </div>
                                                )}
                                                <PlanBlock plan={plan} />
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
                                    onClick={sendMessage}
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
