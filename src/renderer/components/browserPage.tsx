import React, { useEffect, useState } from "react";
import {
    ChevronsLeft,
    ChevronsRight,
    Loader2,
    AlertCircle,
} from "lucide-react";

// BrowserView 抽屉组件
const BrowserViewDrawer: React.FC<{
    isOpen: boolean;
    onToggle: () => void;
}> = ({ isOpen, onToggle }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 控制 BrowserView 的显示/隐藏
        if (window.electronAPI?.toggleBrowserView) {
            window.electronAPI.toggleBrowserView(isOpen).catch((err) => {
                console.error("Failed to toggle browser view:", err);
                setError("无法控制浏览器视图");
            });
        }

        // 监听加载状态
        const handleLoading = (loading: boolean) => {
            setIsLoading(loading);
            if (loading) setError(null); // 清除之前的错误
        };

        const handleError = (errorInfo: {
            errorCode: number;
            errorDescription: string;
        }) => {
            setIsLoading(false);
            setError(
                `加载失败: ${errorInfo.errorDescription} (${errorInfo.errorCode})`
            );
        };

        // 添加事件监听器
        if (window.electronAPI?.onBrowserViewLoading) {
            window.electronAPI.onBrowserViewLoading(handleLoading);
        }
        if (window.electronAPI?.onBrowserViewError) {
            window.electronAPI.onBrowserViewError(handleError);
        }

        // 清理函数（这里不能移除事件监听器，因为 Electron 的 ipcRenderer 不支持）
        return () => {
            // BrowserView 由主进程管理，这里不需要特殊清理
        };
    }, [isOpen]);

    return (
        <>
            {/* 抽屉容器 - 只用于视觉效果和按钮定位 */}
            <div
                className={`fixed left-0 top-0 h-full bg-transparent transition-transform duration-300 ease-in-out z-40 ${
                    isOpen ? "translate-x-0" : "-translate-x-full"
                }`}
                style={{ width: "500px" }}
            >
                {/* 状态指示器 */}
                {isOpen && (isLoading || error) && (
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg px-3 py-2 shadow-lg z-50">
                        {isLoading && (
                            <div className="flex items-center space-x-2 text-blue-600">
                                <Loader2 size={16} className="animate-spin" />
                                <span className="text-sm">加载中...</span>
                            </div>
                        )}
                        {error && (
                            <div className="flex items-center space-x-2 text-red-600">
                                <AlertCircle size={16} />
                                <span className="text-sm">{error}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* 关闭按钮 - 抽屉打开时显示，位于抽屉最右边 */}
                {isOpen && (
                    <button
                        onClick={onToggle}
                        className="absolute top-1/2 -right-10 transform -translate-y-1/2 bg-white hover:bg-gray-50 border border-l-0 border-gray-200 rounded-l-none rounded-r-lg p-3 transition-all duration-300 hover:scale-110 z-50 shadow-sm"
                        title="收起搜索"
                    >
                        <ChevronsLeft size={20} className="text-gray-600" />
                    </button>
                )}
            </div>

            {/* 打开按钮 - 抽屉关闭时显示 */}
            {!isOpen && (
                <button
                    onClick={onToggle}
                    className="fixed top-1/2 left-0 transform -translate-y-1/2 bg-white hover:bg-gray-50 border border-r-0 border-gray-200 rounded-r-lg rounded-l-none p-3 transition-all duration-300 hover:scale-110 z-40 shadow-sm"
                    title="打开搜索"
                >
                    <ChevronsRight size={20} className="text-gray-600" />
                </button>
            )}
        </>
    );
};

export default BrowserViewDrawer;
