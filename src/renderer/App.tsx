import React, { useState } from "react";
import BrowserViewDrawer from "@components/BrowserPage";
import { ChatDrawer } from "@components/ChatDrawer";
import AMapComponent from "@components/AMap";

// 主应用组件
const App: React.FC = () => {
    const [isChatOpen, setIsChatOpen] = useState<boolean>(true); // Electron 环境默认打开，Web 环境默认关闭

    const toggleChat = () => setIsChatOpen(!isChatOpen);

    // Electron 环境显示完整的地图界面
    return (
        <div className="relative w-screen h-screen overflow-hidden bg-travel-cream">
            {/* 高德地图容器 */}
            <div className="w-full h-full">
                <AMapComponent />
            </div>

            {/* BrowserView 抽屉 */}
            {/* <BrowserViewDrawer
                isOpen={isWebViewOpen}
                onToggle={() => setIsWebViewOpen(!isWebViewOpen)}
            /> */}

            {/* 对话抽屉 */}
            <ChatDrawer isOpen={isChatOpen} onToggle={toggleChat} />
        </div>
    );
};

export default App;
