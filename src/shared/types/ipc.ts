import { McpStatus, McpInitializedEvent } from './mcp';

/**
 * BrowserView相关类型定义
 */
export interface BrowserViewBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface BrowserPageInfo {
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    isLoading: boolean;
}

export interface BrowserLoadError {
    errorCode: number;
    errorDescription: string;
    url: string;
}

export interface BrowserDOMContent {
    text: string;
    links: Array<{ text: string; href: string }>;
    images: Array<{ alt: string; src: string }>;
    headings: Array<{ level: number; text: string }>;
    articles: Array<{ title: string; content: string }>;
}

/**
 * Electron API 接口定义
 */
export interface ElectronAPI {
    // 系统信息
    getVersion: () => string;
    getPlatform: () => string;

    // 聊天相关
    chatStreamMessage: (message: string) => Promise<{ success: boolean; error?: string }>;
    onChatMessageChunk: (callback: (chunk: string) => void) => void;
    onChatMessageComplete: (callback: () => void) => void;
    onChatMessageError: (callback: (error: string) => void) => void;

    // MCP 状态
    getMcpStatus: () => Promise<McpStatus>;
    onMcpInitialized: (callback: (status: McpInitializedEvent) => void) => void;

    // 地图配置
    getMapConfig: () => { amapKey: string };

    // BrowserView 控制
    browserViewCreate: () => Promise<{ success: boolean }>;
    browserViewShow: (bounds: BrowserViewBounds) => Promise<{ success: boolean }>;
    browserViewHide: () => Promise<{ success: boolean }>;
    browserViewUpdateBounds: (bounds: BrowserViewBounds) => Promise<{ success: boolean }>;
    browserViewNavigate: (url: string) => Promise<{ success: boolean }>;
    browserViewGoBack: () => Promise<{ success: boolean }>;
    browserViewGoForward: () => Promise<{ success: boolean }>;
    browserViewReload: () => Promise<{ success: boolean }>;
    browserViewStop: () => Promise<{ success: boolean }>;
    browserViewGetInfo: () => Promise<BrowserPageInfo>;
    browserViewExtractDOM: () => Promise<{ success: boolean }>;

    // BrowserView 事件监听
    onBrowserPageInfoUpdated: (callback: (info: BrowserPageInfo) => void) => void;
    onBrowserLoadingStarted: (callback: () => void) => void;
    onBrowserLoadingFinished: (callback: () => void) => void;
    onBrowserLoadFailed: (callback: (error: BrowserLoadError) => void) => void;
    onBrowserNavigated: (callback: (data: { url: string }) => void) => void;
    onBrowserDOMContent: (callback: (content: BrowserDOMContent) => void) => void;

    // 原有的BrowserView控制（保持兼容）
    toggleBrowserView: (isOpen: boolean) => Promise<boolean>;
    onBrowserViewLoading: (callback: (isLoading: boolean) => void) => void;
    onBrowserViewError: (
        callback: (error: { errorCode: number; errorDescription: string }) => void
    ) => void;
}

// 全局类型声明
declare global {
    interface Window {
        electronAPI: ElectronAPI;
    }
}
