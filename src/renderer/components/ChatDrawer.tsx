import React, { useState, useEffect, useRef } from 'react';
import {
    HelpCircle,
    RotateCcw,
    Settings,
    Sparkles,
    Send,
    ChevronsLeft,
    ChevronsRight,
    Bot,
    User,
} from 'lucide-react';
import { createChatAPI, type ChatAPI } from '@/main/ipc/chat-api';

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

// 对话抽屉组件 - 完全基于HTML原型重新设计
export const ChatDrawer: React.FC<{
    isOpen: boolean;
    onToggle: () => void;
}> = ({ isOpen, onToggle }) => {
    const [inputMessage, setInputMessage] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            id: '1',
            content: '你好！我是你的旅行助手，可以帮你规划行程。请告诉我你想去哪里？',
            sender: 'ai',
            timestamp: new Date(),
        },
    ]);
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

    return (
        <>
            {/* 外层抽屉容器 */}
            <div
                className={`fixed right-0 top-0 h-full w-[375px] transition-transform duration-300 ease-in-out z-50 ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* 主体盒子 */}
                <div className="chat-panel m-5 flex flex-col overflow-hidden rounded-[20px] bg-brand-surface shadow-[0_10px_30px_rgba(0,0,0,0.1)] font-app">
                    {/* 头部 */}
                    <header className="flex justify-between items-center flex-shrink-0 py-4 px-5">
                        <div className="flex">
                            <button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70 text-brand-icon">
                                <HelpCircle size={24} />
                            </button>
                        </div>
                        <div className="flex gap-5">
                            <button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70 text-brand-icon">
                                <RotateCcw size={24} />
                            </button>
                            <button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70 text-brand-icon">
                                <Settings size={24} />
                            </button>
                            <div className="w-6 h-6 rounded-full cursor-pointer from-brand-gradientFrom to-brand-gradientTo bg-[linear-gradient(135deg,var(--tw-gradient-from),var(--tw-gradient-to))]" />
                        </div>
                    </header>

                    {/* 主内容区 */}
                    <main className="flex-1 overflow-y-auto px-6">
                        {messages.length <= 1 ? (
                            <div>
                                {suggestions.map((s) => (
                                    <div
                                        key={s.id}
                                        onClick={() => handleSuggestionClick(s)}
                                        className="py-[18px] border-b border-brand-divider cursor-pointer transition-colors hover:bg-black/5"
                                    >
                                        <p className="m-0 leading-[1.5] text-[15px] text-brand-icon/70">
                                            {s.text}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="space-y-6 py-4">
                                {messages.map((message) => (
                                    <div
                                        key={message.id}
                                        className={`flex gap-3 ${
                                            message.sender === 'user'
                                                ? 'ml-auto flex-row-reverse max-w-[80%]'
                                                : 'max-w-[85%]'
                                        }`}
                                    >
                                        <div
                                            className={`w-8 h-8 mt-1 rounded-full flex items-center justify-center flex-shrink-0 ${
                                                message.sender === 'ai'
                                                    ? 'bg-gray-100 text-gray-600'
                                                    : 'bg-blue-500 text-white'
                                            }`}
                                        >
                                            {message.sender === 'ai' ? (
                                                <Bot size={16} />
                                            ) : (
                                                <User size={16} />
                                            )}
                                        </div>
                                        <div
                                            className={`relative rounded-[18px] px-4 py-3 shadow-sm ${
                                                message.sender === 'user'
                                                    ? 'bg-blue-500 text-white'
                                                    : 'bg-white border border-gray-200 text-gray-700'
                                            }`}
                                        >
                                            <p className="text-sm leading-relaxed mb-1">
                                                {message.content}
                                            </p>
                                            <p
                                                className={`text-xs ${
                                                    message.sender === 'user'
                                                        ? 'text-white/70'
                                                        : 'text-gray-500'
                                                }`}
                                            >
                                                {message.timestamp.toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <div className="flex gap-3 max-w-[85%]">
                                        <div className="w-8 h-8 mt-1 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                            <Bot size={16} className="text-gray-600" />
                                        </div>
                                        <div className="bg-white border border-gray-200 rounded-[18px] px-4 py-3 shadow-sm">
                                            <div className="flex gap-1">
                                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                                                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                                            </div>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>
                        )}
                    </main>

                    {/* 输入区 */}
                    <footer className="mt-auto px-6 pt-4 pb-6">
                        <div className="flex items-center bg-brand-surface border border-brand-border rounded-[12px] px-3 h-[52px] transition-all focus-within:border-brand-icon focus-within:shadow-[0_0_0_2px_rgba(140,140,106,0.2)]">
                            <Sparkles size={24} className="text-brand-icon" />
                            <input
                                type="text"
                                value={inputMessage}
                                onChange={(e) => setInputMessage(e.target.value)}
                                onKeyDown={handleKeyPress}
                                placeholder="你想要做什么？"
                                className="flex-grow bg-transparent outline-none border-none text-[16px] text-brand-icon/70 px-2 placeholder:text-brand-icon/40"
                            />
                            <button
                                onClick={sendMessage}
                                disabled={inputMessage.trim() === '' || isLoading}
                                className={`p-0 bg-transparent border-none cursor-pointer text-brand-icon transition-opacity ${
                                    inputMessage.trim() === '' || isLoading
                                        ? 'opacity-50 cursor-not-allowed'
                                        : 'hover:opacity-80'
                                }`}
                            >
                                <Send size={24} />
                            </button>
                        </div>
                    </footer>
                </div>

                {/* 收缩按钮 */}
                {isOpen && (
                    <button
                        onClick={onToggle}
                        className="absolute top-1/2 -left-12 -translate-y-1/2 w-10 h-16 bg-white border border-gray-300 rounded-l-lg hover:bg-gray-50 transition-all shadow-sm flex items-center justify-center"
                        title="收起对话"
                    >
                        <ChevronsRight size={18} className="text-brand-icon" />
                    </button>
                )}
            </div>

            {/* 展开按钮 */}
            {!isOpen && (
                <button
                    onClick={onToggle}
                    className="fixed top-1/2 right-0 -translate-y-1/2 w-10 h-16 bg-white border border-gray-300 rounded-l-lg hover:bg-gray-50 transition-all shadow-sm flex items-center justify-center z-40"
                    title="打开对话"
                >
                    <ChevronsLeft size={18} className="text-brand-icon" />
                </button>
            )}
        </>
    );
};
