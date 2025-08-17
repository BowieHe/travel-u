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
    Search,
    Bookmark,
    Download,
    Share,
    Sparkles,
    Eye,
} from 'lucide-react';
import { BrowserPageInfo, BrowserLoadError, BrowserViewBounds, BrowserDOMContent } from '@shared/types/ipc';

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
    const [domContent, setDomContent] = useState<BrowserDOMContent | null>(null);
    const [showDomExtraction, setShowDomExtraction] = useState(false);
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
            setDomContent(null);
        };

        const handleLoadingFinished = () => {
            setPageInfo(prev => ({ ...prev, isLoading: false }));
            // 页面加载完成后自动提取DOM内容
            setTimeout(() => {
                handleExtractDOM();
            }, 1000);
        };

        const handleLoadFailed = (error: BrowserLoadError) => {
            setPageInfo(prev => ({ ...prev, isLoading: false }));
            setLoadError(error);
        };

        const handleNavigated = (data: { url: string }) => {
            setUrl(data.url);
            setPageInfo(prev => ({ ...prev, url: data.url }));
        };

        const handleDOMContent = (content: BrowserDOMContent) => {
            setDomContent(content);
        };

        // 注册事件监听器
        window.electronAPI.onBrowserPageInfoUpdated(handlePageInfoUpdate);
        window.electronAPI.onBrowserLoadingStarted(handleLoadingStarted);
        window.electronAPI.onBrowserLoadingFinished(handleLoadingFinished);
        window.electronAPI.onBrowserLoadFailed(handleLoadFailed);
        window.electronAPI.onBrowserNavigated(handleNavigated);
        window.electronAPI.onBrowserDOMContent(handleDOMContent);

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
        { name: '携程', url: 'https://www.ctrip.com/', icon: '✈️', color: 'bg-blue-50 hover:bg-blue-100 text-blue-700' },
        { name: '小红书', url: 'https://www.xiaohongshu.com/explore', icon: '📖', color: 'bg-red-50 hover:bg-red-100 text-red-700' },
        { name: '马蜂窝', url: 'https://www.mafengwo.cn/', icon: '🐝', color: 'bg-yellow-50 hover:bg-yellow-100 text-yellow-700' },
        { name: '去哪儿', url: 'https://www.qunar.com/', icon: '🎒', color: 'bg-green-50 hover:bg-green-100 text-green-700' },
        { name: '途牛', url: 'https://www.tuniu.com/', icon: '🐄', color: 'bg-purple-50 hover:bg-purple-100 text-purple-700' },
        { name: '飞猪', url: 'https://www.fliggy.com/', icon: '🐷', color: 'bg-pink-50 hover:bg-pink-100 text-pink-700' },
    ];

    const navigateToUrl = async (targetUrl: string) => {
        try {
            await window.electronAPI.browserViewNavigate(targetUrl);
        } catch (error) {
            console.error('导航失败:', error);
        }
    };

    // DOM内容提取功能
    const handleExtractDOM = async () => {
        try {
            await window.electronAPI.browserViewExtractDOM();
        } catch (error) {
            console.error('提取DOM内容失败:', error);
        }
    };

    const handleToggleDomExtraction = () => {
        setShowDomExtraction(!showDomExtraction);
        if (!domContent && !showDomExtraction) {
            handleExtractDOM();
        }
    };

    return (
        <>
            {/* 左侧浏览器抽屉容器 */}
            <div
                ref={containerRef}
                className={`fixed left-0 top-0 h-full w-[min(45%,_800px)] transition-all duration-300 ease-out z-50 ${
                    isOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                {/* 主体容器 - 现代化设计 */}
                <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-white via-gray-50 to-blue-50/30 shadow-2xl border-r border-gray-200/50 backdrop-blur-xl">
                    {/* 现代化头部区域 */}
                    <header className="flex flex-col flex-shrink-0 bg-white/90 backdrop-blur-sm border-b border-gray-200/50">
                        {/* 工具栏 */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                    <Globe size={16} className="text-white" />
                                </div>
                                <span className="font-medium text-sm">智能浏览器</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleToggleDomExtraction}
                                    className={`p-2 rounded-lg transition-all ${
                                        showDomExtraction 
                                            ? 'bg-white/30 text-white' 
                                            : 'hover:bg-white/20 text-white/80'
                                    }`}
                                    title="AI分析内容"
                                >
                                    <Sparkles size={16} />
                                </button>
                                <button
                                    onClick={handleExtractDOM}
                                    className="p-2 rounded-lg hover:bg-white/20 text-white/80 transition-all"
                                    title="提取页面内容"
                                >
                                    <Eye size={16} />
                                </button>
                            </div>
                        </div>

                        {/* 导航控制栏 */}
                        <div className="flex items-center gap-3 px-4 py-3">
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleBack}
                                    disabled={!pageInfo.canGoBack}
                                    className={`p-2.5 rounded-xl transition-all ${
                                        pageInfo.canGoBack
                                            ? 'hover:bg-blue-50 text-blue-600 hover:scale-105'
                                            : 'text-gray-300 cursor-not-allowed'
                                    }`}
                                    title="后退"
                                >
                                    <ArrowLeft size={18} />
                                </button>
                                <button
                                    onClick={handleForward}
                                    disabled={!pageInfo.canGoForward}
                                    className={`p-2.5 rounded-xl transition-all ${
                                        pageInfo.canGoForward
                                            ? 'hover:bg-blue-50 text-blue-600 hover:scale-105'
                                            : 'text-gray-300 cursor-not-allowed'
                                    }`}
                                    title="前进"
                                >
                                    <ArrowRight size={18} />
                                </button>
                                <button
                                    onClick={handleRefresh}
                                    className="p-2.5 rounded-xl hover:bg-green-50 text-green-600 transition-all hover:scale-105"
                                    title="刷新"
                                >
                                    {pageInfo.isLoading ? (
                                        <Loader2 size={18} className="animate-spin" />
                                    ) : (
                                        <RotateCcw size={18} />
                                    )}
                                </button>
                                <button
                                    onClick={handleHome}
                                    className="p-2.5 rounded-xl hover:bg-purple-50 text-purple-600 transition-all hover:scale-105"
                                    title="首页"
                                >
                                    <Home size={18} />
                                </button>
                            </div>

                            {/* 现代化地址栏 */}
                            <form onSubmit={handleUrlSubmit} className="flex-1">
                                <div className="relative group">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search size={16} className="text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="输入网址或搜索内容..."
                                        className="w-full pl-10 pr-12 py-3 bg-white border border-gray-200 rounded-2xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all group-hover:shadow-md"
                                    />
                                    {pageInfo.url !== url && (
                                        <button
                                            type="submit"
                                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-blue-500 hover:text-blue-600 transition-colors"
                                            title="访问"
                                        >
                                            <ExternalLink size={16} />
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>

                        {/* 快捷导航 - 现代化卡片设计 */}
                        <div className="px-4 pb-4">
                            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                                {quickLinks.map((link) => (
                                    <button
                                        key={link.name}
                                        onClick={() => navigateToUrl(link.url)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap hover:scale-105 hover:shadow-sm ${link.color}`}
                                        title={`访问${link.name}`}
                                    >
                                        <span className="text-base">{link.icon}</span>
                                        <span>{link.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* 页面信息栏 */}
                        {pageInfo.title && (
                            <div className="px-4 pb-3">
                                <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                    <span className="text-sm text-gray-600 truncate font-medium">
                                        {pageInfo.title}
                                    </span>
                                </div>
                            </div>
                        )}
                    </header>

                    {/* 主内容区域 */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* BrowserView内容区 */}
                        <main className={`relative overflow-hidden transition-all duration-300 ${
                            showDomExtraction ? 'flex-1' : 'w-full'
                        }`}>
                            {/* 初始化加载状态 */}
                            {!isInitialized && (
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center">
                                    <div className="text-center">
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mb-4 mx-auto animate-pulse">
                                            <Globe size={24} className="text-white" />
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-600">
                                            <Loader2 size={20} className="animate-spin" />
                                            <span className="text-sm font-medium">正在初始化智能浏览器...</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 错误状态 */}
                            {loadError && (
                                <div className="absolute inset-0 bg-gradient-to-br from-red-50 to-orange-50 flex flex-col items-center justify-center z-10 p-6">
                                    <div className="text-center max-w-md">
                                        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-red-500 to-orange-500 flex items-center justify-center mb-4 mx-auto">
                                            <AlertCircle size={24} className="text-white" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                            页面加载失败
                                        </h3>
                                        <p className="text-sm text-gray-600 mb-2">
                                            {loadError.errorDescription}
                                        </p>
                                        <p className="text-xs text-gray-500 mb-6">
                                            错误代码: {loadError.errorCode}
                                        </p>
                                        <div className="flex gap-3 justify-center">
                                            <button
                                                onClick={handleRefresh}
                                                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:shadow-lg transition-all transform hover:scale-105"
                                            >
                                                <RotateCcw size={16} />
                                                重新加载
                                            </button>
                                            <button
                                                onClick={handleHome}
                                                className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all transform hover:scale-105"
                                            >
                                                返回首页
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 加载进度条 */}
                            {pageInfo.isLoading && !loadError && (
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gray-200 z-20">
                                    <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600 animate-pulse"></div>
                                </div>
                            )}

                            {/* BrowserView占位区域 - 现代化设计 */}
                            <div className="w-full h-full bg-gradient-to-br from-gray-50 to-blue-50/30 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-600/10 flex items-center justify-center mb-4 mx-auto">
                                        <Globe size={32} className="text-blue-500/30" />
                                    </div>
                                    <p className="text-sm text-gray-400 font-medium">BrowserView 内容区域</p>
                                    <p className="text-xs text-gray-300 mt-1">网页内容将在此处显示</p>
                                </div>
                            </div>
                        </main>

                        {/* DOM内容分析面板 */}
                        {showDomExtraction && (
                            <aside className="w-80 bg-white border-l border-gray-200 flex flex-col">
                                <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-blue-50">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                            <Sparkles size={16} className="text-purple-600" />
                                            AI内容分析
                                        </h3>
                                        <button
                                            onClick={() => setShowDomExtraction(false)}
                                            className="p-1 hover:bg-gray-200 rounded-lg transition-colors"
                                        >
                                            <ChevronsRight size={16} className="text-gray-500" />
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {domContent ? (
                                        <>
                                            {/* 页面概要 */}
                                            <div className="bg-blue-50 rounded-lg p-3">
                                                <h4 className="font-medium text-blue-900 mb-2">页面概要</h4>
                                                <p className="text-sm text-blue-700 leading-relaxed">
                                                    {domContent.text.slice(0, 200)}...
                                                </p>
                                            </div>

                                            {/* 主要标题 */}
                                            {domContent.headings.length > 0 && (
                                                <div className="bg-green-50 rounded-lg p-3">
                                                    <h4 className="font-medium text-green-900 mb-2">主要标题</h4>
                                                    <div className="space-y-1">
                                                        {domContent.headings.slice(0, 5).map((heading, index) => (
                                                            <div key={index} className="text-sm text-green-700">
                                                                <span className="font-mono text-xs text-green-500">H{heading.level}</span>
                                                                <span className="ml-2">{heading.text}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 重要链接 */}
                                            {domContent.links.length > 0 && (
                                                <div className="bg-purple-50 rounded-lg p-3">
                                                    <h4 className="font-medium text-purple-900 mb-2">重要链接</h4>
                                                    <div className="space-y-1">
                                                        {domContent.links.slice(0, 3).map((link, index) => (
                                                            <div key={index} className="text-sm">
                                                                <a 
                                                                    href={link.href}
                                                                    onClick={(e) => {
                                                                        e.preventDefault();
                                                                        navigateToUrl(link.href);
                                                                    }}
                                                                    className="text-purple-600 hover:text-purple-800 font-medium cursor-pointer"
                                                                >
                                                                    {link.text}
                                                                </a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 操作按钮 */}
                                            <div className="space-y-2">
                                                <button
                                                    onClick={() => {
                                                        // 这里可以调用主进程的AI分析功能
                                                        console.log('发送给AI进行分析:', domContent);
                                                    }}
                                                    className="w-full py-2 px-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all text-sm font-medium"
                                                >
                                                    发送给AI分析
                                                </button>
                                                <button
                                                    onClick={handleExtractDOM}
                                                    className="w-full py-2 px-4 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                                                >
                                                    重新提取内容
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center py-8">
                                            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3 mx-auto">
                                                <Eye size={20} className="text-gray-400" />
                                            </div>
                                            <p className="text-sm text-gray-500">暂无内容分析</p>
                                            <button
                                                onClick={handleExtractDOM}
                                                className="mt-3 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm"
                                            >
                                                开始分析
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </aside>
                        )}
                    </div>
                </div>

                {/* 现代化收缩按钮 */}
                {isOpen && (
                    <button
                        onClick={onToggle}
                        className="absolute top-1/2 right-0 translate-x-full -translate-y-1/2 w-10 h-16 bg-gradient-to-r from-blue-500 to-purple-600 border border-blue-400 rounded-r-2xl hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center backdrop-blur-sm group"
                        title="收起浏览器"
                    >
                        <ChevronsLeft size={18} className="text-white group-hover:scale-110 transition-transform" />
                    </button>
                )}
            </div>

            {/* 现代化展开按钮 */}
            {!isOpen && (
                <button
                    onClick={onToggle}
                    className="fixed top-1/2 left-0 -translate-y-1/2 w-10 h-16 bg-gradient-to-r from-blue-500 to-purple-600 border border-blue-400 rounded-r-2xl hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg flex items-center justify-center z-40 backdrop-blur-sm group"
                    title="打开智能浏览器"
                >
                    <ChevronsRight size={18} className="text-white group-hover:scale-110 transition-transform" />
                </button>
            )}
        </>
    );
};
