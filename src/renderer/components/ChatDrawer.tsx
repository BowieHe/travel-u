import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";

interface SuggestionItem {
	id: string;
	text: string;
}

interface Message {
	id: string;
	content: string;
	sender: "user" | "ai";
	timestamp: Date;
	isLoading?: boolean;
}

// 对话抽屉组件 - 完全基于HTML原型重新设计
export const ChatDrawer: React.FC<{
	isOpen: boolean;
	onToggle: () => void;
}> = ({ isOpen, onToggle }) => {
	const [inputMessage, setInputMessage] = useState("");
	const [messages, setMessages] = useState<Message[]>([
		{
			id: "1",
			content:
				"你好！我是你的旅行助手，可以帮你规划行程。请告诉我你想去哪里？",
			sender: "ai",
			timestamp: new Date(),
		},
	]);
	const [isLoading, setIsLoading] = useState(false);
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const suggestions: SuggestionItem[] = [
		{
			id: "1",
			text: "帮我总结当前页面的内容",
		},
		{
			id: "2",
			text: "比较北京和上海的旅游特色，用表格形式展示主要景点、美食和交通方式",
		},
		{
			id: "3",
			text: "访问故宫博物院官网，查询成人门票价格和购买方式",
		},
		{
			id: "4",
			text: "帮我制定一份3天2夜的杭州旅行攻略，包含西湖周边必游景点",
		},
		{
			id: "5",
			text: "请解释什么是'慢生活'旅行理念，并给出简要总结",
		},
	];

	const handleSuggestionClick = (suggestion: SuggestionItem) => {
		setInputMessage(suggestion.text);
	};

	const sendMessage = async () => {
		if (inputMessage.trim() === "" || isLoading) return;

		const userMessage: Message = {
			id: Date.now().toString(),
			content: inputMessage,
			sender: "user",
			timestamp: new Date(),
		};

		// 添加用户消息到对话
		setMessages((prev) => [...prev, userMessage]);
		const currentMessage = inputMessage;
		setInputMessage("");
		setIsLoading(true);

		try {
			// 调用 Electron API 发送消息给 LangGraph
			const aiResponse = await window.electronAPI.sendMessage(
				currentMessage
			);

			// 添加 AI 回复到对话
			const aiMessage: Message = {
				id: (Date.now() + 1).toString(),
				content: aiResponse,
				sender: "ai",
				timestamp: new Date(),
			};

			setMessages((prev) => [...prev, aiMessage]);
		} catch (error) {
			console.error("发送消息失败:", error);
			// 添加错误消息
			const errorMessage: Message = {
				id: (Date.now() + 2).toString(),
				content: "抱歉，我遇到了一个错误，请稍后重试。",
				sender: "ai",
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, errorMessage]);
		} finally {
			setIsLoading(false);
		}
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	};

	return (
		<>
			{/* 聊天容器 */}
			<div
				className={`fixed right-0 top-0 h-full transition-transform duration-300 ease-in-out z-50 ${
					isOpen ? "translate-x-0" : "translate-x-full"
				}`}
				style={{ width: "375px" }}
			>
				{/* 主容器 - 完全复制HTML原型的圆角容器 */}
				<div
					className="h-full flex flex-col overflow-hidden shadow-2xl"
					style={{
						backgroundColor: "#faf9f5",
						borderRadius: "20px",
						margin: "20px",
						height: "calc(100vh - 40px)",
						boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
						fontFamily:
							"'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
					}}
				>
					{/* 头部 - 完全复制HTML原型 */}
					<header
						className="flex justify-between items-center flex-shrink-0"
						style={{ padding: "16px 20px" }}
					>
						{/* 左侧图标 */}
						<div className="flex">
							<button
								className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70"
								style={{ padding: "0" }}
							>
								<HelpCircle
									size={24}
									style={{ color: "#8c8c6a" }}
								/>
							</button>
						</div>

						{/* 右侧图标组 */}
						<div className="flex" style={{ gap: "20px" }}>
							<button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70">
								<RotateCcw
									size={24}
									style={{ color: "#8c8c6a" }}
								/>
							</button>
							<button className="p-0 bg-transparent border-none cursor-pointer transition-opacity hover:opacity-70">
								<Settings
									size={24}
									style={{ color: "#8c8c6a" }}
								/>
							</button>
							{/* 个人资料图标 */}
							<div
								className="rounded-full cursor-pointer"
								style={{
									width: "24px",
									height: "24px",
									background:
										"linear-gradient(135deg, #aaa, #666)",
								}}
							/>
						</div>
					</header>

					{/* 建议区域或消息区域 */}
					<main
						className="flex-1 overflow-y-auto"
						style={{ padding: "0 24px" }}
					>
						{messages.length <= 1 ? (
							// 显示建议（初始状态）
							suggestions.map((suggestion) => (
								<div
									key={suggestion.id}
									className="cursor-pointer transition-colors"
									style={{
										padding: "18px 0",
										borderBottom: "1px solid #eae8e2",
									}}
									onMouseEnter={(e) => {
										e.currentTarget.style.backgroundColor =
											"rgba(0, 0, 0, 0.02)";
									}}
									onMouseLeave={(e) => {
										e.currentTarget.style.backgroundColor =
											"transparent";
									}}
									onClick={() =>
										handleSuggestionClick(suggestion)
									}
								>
									<p
										style={{
											lineHeight: "1.5",
											fontSize: "15px",
											color: "#79736a",
											margin: "0",
										}}
									>
										{suggestion.text}
									</p>
								</div>
							))
						) : (
							// 显示对话消息
							<div className="space-y-6 py-4">
								{messages.map((message) => (
									<div
										key={message.id}
										className={`flex gap-3 ${
											message.sender === "user"
												? "ml-auto flex-row-reverse max-w-[80%]"
												: "max-w-[85%]"
										}`}
									>
										{/* 头像 */}
										<div
											className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
												message.sender === "ai"
													? "bg-gray-100 text-gray-600"
													: "bg-blue-500 text-white"
											}`}
										>
											{message.sender === "ai" ? (
												<Bot size={16} />
											) : (
												<User size={16} />
											)}
										</div>

										{/* 消息气泡 */}
										<div
											className={`rounded-[18px] px-4 py-3 relative ${
												message.sender === "user"
													? "bg-blue-500 text-white"
													: "bg-white border border-gray-200 text-gray-700"
											} shadow-sm`}
										>
											<p className="text-sm leading-relaxed mb-1">
												{message.content}
											</p>
											<p
												className={`text-xs ${
													message.sender === "user"
														? "text-white/70"
														: "text-gray-500"
												}`}
											>
												{message.timestamp.toLocaleTimeString(
													[],
													{
														hour: "2-digit",
														minute: "2-digit",
													}
												)}
											</p>
										</div>
									</div>
								))}

								{/* 加载指示器 */}
								{isLoading && (
									<div className="flex gap-3 max-w-[85%]">
										<div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
											<Bot
												size={16}
												className="text-gray-600"
											/>
										</div>
										<div className="bg-white border border-gray-200 rounded-[18px] px-4 py-3 shadow-sm">
											<div className="flex gap-1">
												<div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
												<div
													className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
													style={{
														animationDelay: "0.1s",
													}}
												></div>
												<div
													className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
													style={{
														animationDelay: "0.2s",
													}}
												></div>
											</div>
										</div>
									</div>
								)}
								<div ref={messagesEndRef} />
							</div>
						)}
					</main>

					{/* 输入区域 - 完全复制HTML原型 */}
					<footer
						className="mt-auto"
						style={{ padding: "16px 24px 24px 24px" }}
					>
						<div
							className="flex items-center transition-all"
							style={{
								backgroundColor: "#faf9f5",
								border: "1px solid #dcd9d3",
								borderRadius: "12px",
								padding: "0 12px",
								height: "52px",
							}}
							onFocus={(e) => {
								e.currentTarget.style.borderColor = "#8c8c6a";
								e.currentTarget.style.boxShadow =
									"0 0 0 2px rgba(140, 140, 106, 0.2)";
							}}
							onBlur={(e) => {
								e.currentTarget.style.borderColor = "#dcd9d3";
								e.currentTarget.style.boxShadow = "none";
							}}
						>
							{/* Sparkle 图标 */}
							<Sparkles size={24} style={{ color: "#8c8c6a" }} />

							{/* 输入框 */}
							<input
								type="text"
								value={inputMessage}
								onChange={(e) =>
									setInputMessage(e.target.value)
								}
								onKeyPress={handleKeyPress}
								placeholder="你想要做什么？"
								className="flex-grow border-none outline-none bg-transparent"
								style={{
									fontSize: "16px",
									color: "#79736a",
									padding: "0 8px",
								}}
							/>

							{/* 发送按钮 */}
							<button
								onClick={sendMessage}
								disabled={
									inputMessage.trim() === "" || isLoading
								}
								className={`bg-transparent border-none cursor-pointer ${
									inputMessage.trim() === "" || isLoading
										? "opacity-50 cursor-not-allowed"
										: "hover:opacity-80"
								} transition-opacity`}
								style={{ padding: "0" }}
							>
								<Send size={24} style={{ color: "#8c8c6a" }} />
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
						<ChevronsRight size={18} style={{ color: "#8c8c6a" }} />
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
					<ChevronsLeft size={18} style={{ color: "#8c8c6a" }} />
				</button>
			)}
		</>
	);
};
