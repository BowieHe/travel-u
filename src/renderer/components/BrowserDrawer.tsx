import React, { useState, useEffect, useRef } from 'react';
import {
    ArrowLeft,
    ArrowRight,
    RotateCcw,
    Home,
    Globe,
    ChevronsLeft,
    ChevronsRight,
    ExternalLink,
    Loader2,
    AlertCircle,
} from 'lucide-react';
import { BrowserPageInfo, BrowserLoadError, BrowserViewBounds } from '@shared/types/ipc';

interface BrowserDrawerProps {
    isOpen: boolean;
    onToggle: () => void;
}

export const BrowserDrawer: React.FC<BrowserDrawerProps> = ({ isOpen, onToggle }) => {
    const [url, setUrl] = useState('https://www.bing.com/');
    const [pageInfo, setPageInfo] = useState<BrowserPageInfo>({
        url: 'https://www.bing.com/',
        title: 'Bing',
        canGoBack: false,
        canGoForward: false,
        isLoading: false,
    });
    const [loadError, setLoadError] = useState<BrowserLoadError | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // 计算BrowserView的边界
    const calculateBrowserViewBounds = (): BrowserViewBounds => {
        if (!containerRef.current) {
            return { x: 0, y: 0, width: 640, height: 600 };
        }

        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const headerHeight = 120; // 大概的头部高度

        return {
            x: Math.round(rect.left),
            y: Math.round(rect.top + headerHeight),
            width: Math.round(rect.width),
            height: Math.round(rect.height - headerHeight),
        };
    };

    // 初始化BrowserView
    useEffect(() => {
        const initBrowserView = async () => {
            try {
                await window.electronAPI.browserViewCreate();
                setIsInitialized(true);
                console.log('BrowserView创建成功');
            } catch (error) {
                console.error('创建BrowserView失败:', error);
            }
        };

        initBrowserView();
    }, []);

    // 处理抽屉打开/关闭
    useEffect(() => {
        if (!isInitialized) return;

        const updateBrowserView = async () => {
            try {
                if (isOpen) {
                    const bounds = calculateBrowserViewBounds();
                    await window.electronAPI.browserViewShow(bounds);
                    // 导航到初始URL
                    await window.electronAPI.browserViewNavigate(pageInfo.url);
                } else {
                    await window.electronAPI.browserViewHide();
                }
            } catch (error) {
                console.error('更新BrowserView失败:', error);
            }
        };

        updateBrowserView();
    }, [isOpen, isInitialized]);

    // 监听窗口大小变化并更新BrowserView边界
    useEffect(() => {
        if (!isOpen || !isInitialized) return;

        const handleResize = () => {
            const bounds = calculateBrowserViewBounds();
            window.electronAPI.browserViewUpdateBounds(bounds);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [isOpen, isInitialized]);

    // 监听页面信息更新
    useEffect(() => {
        const handlePageInfoUpdate = (info: BrowserPageInfo) => {
            setPageInfo(info);
            setUrl(info.url);
            setLoadError(null);
        };

        const handleLoadingStarted = () => {
            setPageInfo(prev => ({ ...prev, isLoading: true }));
            setLoadError(null);
        };

        const handleLoadingFinished = () => {
            setPageInfo(prev => ({ ...prev, isLoading: false }));
        };

        const handleLoadFailed = (error: BrowserLoadError) => {
            setPageInfo(prev => ({ ...prev, isLoading: false }));
            setLoadError(error);
        };

        const handleNavigated = (data: { url: string }) => {
            setUrl(data.url);
            setPageInfo(prev => ({ ...prev, url: data.url }));
        };

        // 注册事件监听器
        window.electronAPI.onBrowserPageInfoUpdated(handlePageInfoUpdate);
        window.electronAPI.onBrowserLoadingStarted(handleLoadingStarted);
        window.electronAPI.onBrowserLoadingFinished(handleLoadingFinished);
        window.electronAPI.onBrowserLoadFailed(handleLoadFailed);
        window.electronAPI.onBrowserNavigated(handleNavigated);

        // 清理函数
        return () => {
            // Note: Electron IPC listeners需要手动清理
            // 这里简化处理，实际项目中可能需要更复杂的清理逻辑
        };
    }, []);

    // 处理地址栏输入
    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        let targetUrl = url.trim();

        // 简单的URL格式化
        if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
            if (targetUrl.includes('.')) {
                targetUrl = 'https://' + targetUrl;
            } else {
                // 如果不是URL，用Bing搜索
                targetUrl = `https://www.bing.com/search?q=${encodeURIComponent(targetUrl)}`;
            }
        }

        try {
            await window.electronAPI.browserViewNavigate(targetUrl);
        } catch (error) {
            console.error('导航失败:', error);
        }
    };

    // 导航按钮处理
    const handleBack = async () => {
        try {
            await window.electronAPI.browserViewGoBack();
        } catch (error) {
            console.error('后退失败:', error);
        }
    };

    const handleForward = async () => {
        try {
            await window.electronAPI.browserViewGoForward();
        } catch (error) {
            console.error('前进失败:', error);
        }
    };

    const handleRefresh = async () => {
        try {
            await window.electronAPI.browserViewReload();
        } catch (error) {
            console.error('刷新失败:', error);
        }
    };

    const handleHome = async () => {
        try {
            await window.electronAPI.browserViewNavigate('https://www.bing.com/');
        } catch (error) {
            console.error('导航到首页失败:', error);
        }
    };

    // 预定义的快捷导航
    const quickLinks = [
        { name: '携程', url: 'https://www.ctrip.com/', icon: '✈️' },
        { name: '小红书', url: 'https://www.xiaohongshu.com/explore', icon: '📖' },
        { name: '马蜂窝', url: 'https://www.mafengwo.cn/', icon: '🐝' },
        { name: '去哪儿', url: 'https://www.qunar.com/', icon: '🎒' },
        { name: '途牛', url: 'https://www.tuniu.com/', icon: '🐄' },
        { name: '飞猪', url: 'https://www.fliggy.com/', icon: '🐷' },
    ];

    const navigateToUrl = async (targetUrl: string) => {
        try {
            await window.electronAPI.browserViewNavigate(targetUrl);
        } catch (error) {
            console.error('导航失败:', error);
        }
    };

    return (
        <>
            {/* 左侧浏览器抽屉容器 */}
            <div
                ref={containerRef}
                className={`fixed left-0 top-0 h-full w-[min(40%,_640px)] transition-transform duration-300 ease-in-out z-50 ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                {/* 主体盒子 */}
                <div className="browser-panel h-full flex flex-col overflow-hidden bg-white shadow-[0_8px_28px_rgba(0,0,0,0.08)] font-app backdrop-blur supports-[backdrop-filter]:bg-white/95">
                    {/* 浏览器头部 */}
                    <header className="flex flex-col flex-shrink-0 border-b border-gray-200">
                        {/* 导航栏 */}
                        <div className="flex items-center gap-2 px-4 py-3">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleBack}
                                    disabled={!pageInfo.canGoBack}
                                    className={`p-2 rounded-lg transition-all ${
                                        pageInfo.canGoBack
                                            ? 'hover:bg-gray-100 text-gray-700'
                                            : 'text-gray-300 cursor-not-allowed'
                                    }`}
                                    title="后退"
                                >
                                    <ArrowLeft size={16} />
                                </button>
                                <button
                                    onClick={handleForward}
                                    disabled={!pageInfo.canGoForward}
                                    className={`p-2 rounded-lg transition-all ${
                                        pageInfo.canGoForward
                                            ? 'hover:bg-gray-100 text-gray-700'
                                            : 'text-gray-300 cursor-not-allowed'
                                    }`}
                                    title="前进"
                                >
                                    <ArrowRight size={16} />
                                </button>
                                <button
                                    onClick={handleRefresh}
                                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-all"
                                    title="刷新"
                                >
                                    {pageInfo.isLoading ? (
                                        <Loader2 size={16} className="animate-spin" />
                                    ) : (
                                        <RotateCcw size={16} />
                                    )}
                                </button>
                                <button
                                    onClick={handleHome}
                                    className="p-2 rounded-lg hover:bg-gray-100 text-gray-700 transition-all"
                                    title="首页"
                                >
                                    <Home size={16} />
                                </button>
                            </div>

                            {/* 地址栏 */}
                            <form onSubmit={handleUrlSubmit} className="flex-1 flex items-center">
                                <div className="flex-1 flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 focus-within:border-blue-500 focus-within:bg-white transition-all">
                                    <Globe size={14} className="text-gray-400 mr-2" />
                                    <input
                                        type="text"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="输入网址或搜索..."
                                        className="flex-1 bg-transparent border-none outline-none text-sm text-gray-700"
                                    />
                                    {pageInfo.url !== url && (
                                        <button
                                            type="submit"
                                            className="ml-2 text-blue-500 hover:text-blue-600"
                                            title="访问"
                                        >
                                            <ExternalLink size={14} />
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* 快捷导航 */}
                        <div className="px-4 pb-3">
                            <div className="flex items-center gap-2 overflow-x-auto">
                                {quickLinks.map((link) => (
                                    <button
                                        key={link.name}
                                        onClick={() => navigateToUrl(link.url)}
                                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 rounded-lg text-xs text-gray-600 hover:text-gray-800 transition-all whitespace-nowrap"
                                        title={`访问${link.name}`}
                                    >
                                        <span>{link.icon}</span>
                                        <span>{link.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 页面标题显示 */}
                        {pageInfo.title && (
                            <div className="px-4 pb-2">
                                <div className="text-sm text-gray-600 truncate">
                                    {pageInfo.title}
                                </div>
                            </div>
                        )}
                    </header>

                    {/* 浏览器内容区 - BrowserView会在这个区域显示 */}
                    <main className="flex-1 relative overflow-hidden">
                        {!isInitialized && (
                            <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
                                <div className="flex items-center gap-2 text-gray-600">
                                    <Loader2 size={20} className="animate-spin" />
                                    <span className="text-sm">正在初始化浏览器...</span>
                                </div>
                            </div>
                        )}

                        {loadError && (
                            <div className="absolute inset-0 bg-gray-50 flex flex-col items-center justify-center z-10 p-6">
                                <div className="text-center max-w-md">
                                    <div className="text-red-500 mb-4">
                                        <AlertCircle size={48} />
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                                        页面加载失败
                                    </h3>
                                    <p className="text-sm text-gray-600 mb-2">
                                        {loadError.errorDescription}
                                    </p>
                                    <p className="text-xs text-gray-500 mb-4">
                                        错误代码: {loadError.errorCode}
                                    </p>
                                    <div className="flex gap-2 justify-center">
                                        <button
                                            onClick={handleRefresh}
                                            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                                        >
                                            <RotateCcw size={16} />
                                            重新加载
                                        </button>
                                        <button
                                            onClick={handleHome}
                                            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                                        >
                                            返回首页
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {pageInfo.isLoading && !loadError && (
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200">
                                <div className="h-full bg-blue-500 animate-pulse"></div>
                            </div>
                        )}

                        {/* 占位区域 - BrowserView会覆盖这个区域 */}
                        <div className="w-full h-full bg-white flex items-center justify-center text-gray-400">
                            <div className="text-center">
                                <Globe size={48} className="mx-auto mb-2 opacity-20" />
                                <p className="text-sm">BrowserView 内容区域</p>
                            </div>
                        </div>
                    </main>
                </div>

                {/* 收缩按钮 */}
                {isOpen && (
                    <button
                        onClick={onToggle}
                        className="absolute top-1/2 right-0 translate-x-full -translate-y-1/2 w-9 h-14 bg-white/90 border border-gray-200 rounded-r-xl hover:bg-white transition-colors shadow-sm flex items-center justify-center backdrop-blur-sm"
                        title="收起浏览器"
                    >
                        <ChevronsLeft size={16} className="text-gray-600" />
                    </button>
                )}
            </div>

            {/* 展开按钮 */}
            {!isOpen && (
                <button
                    onClick={onToggle}
                    className="fixed top-1/2 left-0 -translate-y-1/2 w-9 h-14 bg-white/90 border border-gray-200 rounded-r-xl hover:bg-white transition-colors shadow-sm flex items-center justify-center z-40 backdrop-blur-sm"
                    title="打开浏览器"
                >
                    <ChevronsRight size={16} className="text-gray-600" />
                </button>
            )}
        </>
    );
};
