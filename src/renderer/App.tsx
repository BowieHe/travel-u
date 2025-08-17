import React, { useState } from 'react';
import { BrowserDrawer } from '@components/BrowserDrawer';
import { ChatDrawer } from '@components/ChatDrawer';
import AMapComponent from '@components/AMap';

// 主应用组件
const App: React.FC = () => {
    const [isChatOpen, setIsChatOpen] = useState<boolean>(true); // Electron 环境默认打开，Web 环境默认关闭
    const [isBrowserOpen, setIsBrowserOpen] = useState<boolean>(false); // 浏览器抽屉默认关闭

    const toggleChat = () => setIsChatOpen(!isChatOpen);
    const toggleBrowser = () => setIsBrowserOpen(!isBrowserOpen);

    // Electron 环境显示完整的地图界面
    return (
        <div className="relative w-screen h-screen overflow-hidden bg-travel-cream">
            {/* 高德地图容器 */}
            <div className="w-full h-full">
                <AMapComponent />
            </div>

            {/* 浏览器抽屉 - 左侧 */}
            <BrowserDrawer isOpen={isBrowserOpen} onToggle={toggleBrowser} />

            {/* 对话抽屉 - 右侧 */}
            <ChatDrawer isOpen={isChatOpen} onToggle={toggleChat} />
        </div>
    );
};

export default App;
