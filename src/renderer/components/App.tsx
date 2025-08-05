import React, { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, MapPin } from "lucide-react";

// 定义消息类型
interface Message {
	id: string;
	content: string;
	sender: "user" | "ai";
	timestamp: Date;
}

// 高德地图组件
const AMapComponent: React.FC = () => {
	const mapRef = useRef<HTMLDivElement>(null);
	const mapInstance = useRef<any>(null);

	useEffect(() => {
		const initMap = () => {
			if (!mapRef.current) return;

			// 检查 AMap 是否已加载
			if (!(window as any).AMap) {
				console.error("AMap is not loaded");
				return;
			}

			try {
				// 初始化高德地图
				mapInstance.current = new (window as any).AMap.Map(
					mapRef.current,
					{
						zoom: 4,
						center: [116.397428, 39.90923], // 北京坐标
						viewMode: "2D", // 先使用 2D 模式，避免 WebGL 相关错误
						features: ["bg", "road", "building", "point"],
					}
				);

				// 等待地图完全加载后再添加控件
				mapInstance.current.on("complete", () => {
					try {
						// 添加工具条
						if ((window as any).AMap.ToolBar) {
							mapInstance.current.addControl(
								new (window as any).AMap.ToolBar({
									position: {
										top: "10px",
										right: "10px",
									},
								})
							);
						}

						if ((window as any).AMap.Scale) {
							mapInstance.current.addControl(
								new (window as any).AMap.Scale({
									position: {
										bottom: "10px",
										left: "10px",
									},
								})
							);
						}
					} catch (controlError) {
						console.warn(
							"Failed to add map controls:",
							controlError
						);
					}
				});
			} catch (error) {
				console.error("Failed to initialize AMap:", error);
			}
		};

		// 如果 AMap 已经加载，直接初始化
		if ((window as any).AMap) {
			initMap();
		} else {
			// 否则等待 AMap 加载完成
			const checkAMap = setInterval(() => {
				if ((window as any).AMap) {
					clearInterval(checkAMap);
					initMap();
				}
			}, 100);

			// 10秒后清除检查
			setTimeout(() => clearInterval(checkAMap), 10000);
		}

		return () => {
			if (mapInstance.current) {
				try {
					mapInstance.current.destroy();
				} catch (error) {
					console.warn("Failed to destroy map:", error);
				}
			}
		};
	}, []);

	return <div ref={mapRef} className="w-full h-full" />;
};

// 对话抽屉组件
const ChatDrawer: React.FC<{
	isOpen: boolean;
	onClose: () => void;
}> = ({ isOpen, onClose }) => {
	const [messages, setMessages] = useState<Message[]>([
		{
			id: "1",
			content:
				"你好！我是你的旅行助手，可以帮你规划行程。请告诉我你想去哪里？",
			sender: "ai",
			timestamp: new Date(),
		},
	]);
	const [inputMessage, setInputMessage] = useState("");
	const messagesEndRef = useRef<HTMLDivElement>(null);

	const scrollToBottom = () => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	};

	useEffect(() => {
		scrollToBottom();
	}, [messages]);

	const sendMessage = () => {
		if (inputMessage.trim() === "") return;

		const newMessage: Message = {
			id: Date.now().toString(),
			content: inputMessage,
			sender: "user",
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, newMessage]);
		setInputMessage("");

		// 模拟AI回复
		setTimeout(() => {
			const aiReply: Message = {
				id: (Date.now() + 1).toString(),
				content: `我了解了你的需求："${inputMessage}"。让我为你查找相关的旅行信息...`,
				sender: "ai",
				timestamp: new Date(),
			};
			setMessages((prev) => [...prev, aiReply]);
		}, 1000);
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			sendMessage();
		}
	};

	return (
		<div
			className={`fixed right-0 top-0 h-full bg-white shadow-2xl transition-transform duration-300 ease-in-out z-50 ${
				isOpen ? "translate-x-0" : "translate-x-full"
			}`}
			style={{ width: "400px" }}
		>
			{/* 头部 */}
			<div className="flex items-center justify-between p-4 border-b border-gray-200 bg-blue-600 text-white">
				<div className="flex items-center space-x-2">
					<MessageSquare size={20} />
					<h2 className="font-semibold">Travel Assistant</h2>
				</div>
				<button
					onClick={onClose}
					className="p-1 hover:bg-blue-700 rounded-full transition-colors"
				>
					<X size={20} />
				</button>
			</div>

			{/* 消息列表 */}
			<div
				className="flex-1 overflow-y-auto p-4 space-y-4"
				style={{ height: "calc(100vh - 140px)" }}
			>
				{messages.map((message) => (
					<div
						key={message.id}
						className={`flex ${
							message.sender === "user"
								? "justify-end"
								: "justify-start"
						}`}
					>
						<div
							className={`max-w-[80%] rounded-lg px-4 py-2 ${
								message.sender === "user"
									? "bg-blue-600 text-white"
									: "bg-gray-100 text-gray-800"
							}`}
						>
							<p className="text-sm">{message.content}</p>
							<p className="text-xs opacity-70 mt-1">
								{message.timestamp.toLocaleTimeString()}
							</p>
						</div>
					</div>
				))}
				<div ref={messagesEndRef} />
			</div>

			{/* 输入框 */}
			<div className="p-4 border-t border-gray-200">
				<div className="flex items-center space-x-2">
					<input
						type="text"
						value={inputMessage}
						onChange={(e) => setInputMessage(e.target.value)}
						onKeyPress={handleKeyPress}
						placeholder="询问旅行相关问题..."
						className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
					/>
					<button
						onClick={sendMessage}
						disabled={inputMessage.trim() === ""}
						className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
					>
						<Send size={18} />
					</button>
				</div>
			</div>
		</div>
	);
};

// 主应用组件
const App: React.FC = () => {
	const [isChatOpen, setIsChatOpen] = useState(false);

	return (
		<div className="relative w-screen h-screen overflow-hidden">
			{/* 高德地图容器 */}
			<div className="w-full h-full">
				<AMapComponent />
			</div>

			{/* 浮动按钮 - 打开对话 */}
			{!isChatOpen && (
				<button
					onClick={() => setIsChatOpen(true)}
					className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg transition-all duration-300 hover:scale-110 z-40"
				>
					<MessageSquare size={24} />
				</button>
			)}

			{/* 地图标题 */}
			<div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg z-30">
				<div className="flex items-center space-x-2">
					<MapPin className="text-blue-600" size={20} />
					<h1 className="font-bold text-gray-800">
						Travel-U 旅行规划
					</h1>
				</div>
			</div>

			{/* 对话抽屉 */}
			<ChatDrawer
				isOpen={isChatOpen}
				onClose={() => setIsChatOpen(false)}
			/>
		</div>
	);
};

export default App;
