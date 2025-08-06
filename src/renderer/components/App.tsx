import React, { useState, useEffect, useRef } from "react";
import BrowserViewDrawer from "./browserPage";
import { ChatDrawer } from "./ChatDrawer";

// 定义消息类型

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

// 主应用组件
const App: React.FC = () => {
	const [isChatOpen, setIsChatOpen] = useState(true); // 默认打开聊天抽屉
	const [isWebViewOpen, setIsWebViewOpen] = useState(false);

	return (
		<div className="relative w-screen h-screen overflow-hidden bg-travel-cream">
			{/* 高德地图容器 */}
			<div className="w-full h-full">
				<AMapComponent />
			</div>

			{/* BrowserView 抽屉 */}
			<BrowserViewDrawer
				isOpen={isWebViewOpen}
				onToggle={() => setIsWebViewOpen(!isWebViewOpen)}
			/>

			{/** hide currently */}
			{/* 地图标题 */}
			{/* <div
				className={`absolute top-4 backdrop-blur-sm rounded-lg px-4 py-2 shadow-lg z-30 transition-all duration-300 bg-travel-light border border-travel-accent ${
					isWebViewOpen
						? isChatOpen
							? "left-[520px] right-[420px]"
							: "left-[520px] right-20"
						: isChatOpen
						? "left-20 right-[420px]"
						: "left-20 right-20"
				}`}
			>
				<div className="flex items-center space-x-2">
					<MapPin size={20} className="text-travel-primary" />
					<h1 className="font-bold text-gray-800">
						Travel-U 旅行规划
					</h1>
				</div>
			</div> */}

			{/* 对话抽屉 */}
			<ChatDrawer
				isOpen={isChatOpen}
				onToggle={() => setIsChatOpen(!isChatOpen)}
			/>
		</div>
	);
};

export default App;
