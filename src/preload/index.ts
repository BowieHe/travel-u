import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI, BrowserViewBounds, BrowserPageInfo, BrowserLoadError, BrowserDOMContent } from '@shared/types/ipc';
import { McpInitializedEvent } from '@shared/types/mcp';
import { IPC_CHANNELS } from '@shared/constants/config';

/**
 * 预加载脚本 - 安全地暴露Electron API到渲染进程
 */

const electronAPI: ElectronAPI = {
    // 系统信息
    getVersion: () => process.versions.electron,
    getPlatform: () => process.platform,

    // 聊天相关
    chatStreamMessage: (message: string) => ipcRenderer.invoke(IPC_CHANNELS.CHAT_STREAM_MESSAGE, message),
    onChatMessageChunk: (callback: (chunk: string) => void) =>
        ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_CHUNK, (_, chunk) => callback(chunk)),
    onChatMessageComplete: (callback: () => void) =>
        ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_COMPLETE, () => callback()),
    onChatMessageError: (callback: (error: string) => void) =>
        ipcRenderer.on(IPC_CHANNELS.CHAT_MESSAGE_ERROR, (_, error) => callback(error)),

    // MCP 状态
    getMcpStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_MCP_STATUS),
    onMcpInitialized: (callback: (status: McpInitializedEvent) => void) =>
        ipcRenderer.on(IPC_CHANNELS.MCP_INITIALIZED, (_, status) => callback(status)),

    // 地图配置
    getMapConfig: () => ({
        amapKey: process.env.AMAP_WEB_API || 'YOUR_AMAP_KEY_HERE',
    }),

    // 新的BrowserView控制方法
    browserViewCreate: () => ipcRenderer.invoke('browser-view-create'),
    browserViewShow: (bounds: BrowserViewBounds) => ipcRenderer.invoke('browser-view-show', bounds),
    browserViewHide: () => ipcRenderer.invoke('browser-view-hide'),
    browserViewUpdateBounds: (bounds: BrowserViewBounds) => ipcRenderer.invoke('browser-view-update-bounds', bounds),
    browserViewNavigate: (url: string) => ipcRenderer.invoke('browser-view-navigate', url),
    browserViewGoBack: () => ipcRenderer.invoke('browser-view-go-back'),
    browserViewGoForward: () => ipcRenderer.invoke('browser-view-go-forward'),
    browserViewReload: () => ipcRenderer.invoke('browser-view-reload'),
    browserViewStop: () => ipcRenderer.invoke('browser-view-stop'),
    browserViewGetInfo: () => ipcRenderer.invoke('browser-view-get-info'),
    browserViewExtractDOM: () => ipcRenderer.invoke('browser-view-extract-dom'),

    // BrowserView事件监听
    onBrowserPageInfoUpdated: (callback: (info: BrowserPageInfo) => void) =>
        ipcRenderer.on('browser-page-info-updated', (_, info) => callback(info)),
    onBrowserLoadingStarted: (callback: () => void) =>
        ipcRenderer.on('browser-loading-started', () => callback()),
    onBrowserLoadingFinished: (callback: () => void) =>
        ipcRenderer.on('browser-loading-finished', () => callback()),
    onBrowserLoadFailed: (callback: (error: BrowserLoadError) => void) =>
        ipcRenderer.on('browser-load-failed', (_, error) => callback(error)),
    onBrowserNavigated: (callback: (data: { url: string }) => void) =>
        ipcRenderer.on('browser-navigated', (_, data) => callback(data)),
    onBrowserDOMContent: (callback: (content: BrowserDOMContent) => void) =>
        ipcRenderer.on('browser-dom-content', (_, content) => callback(content)),

    // 原有的BrowserView控制（保持兼容）
    toggleBrowserView: (isOpen: boolean) =>
        ipcRenderer.invoke(IPC_CHANNELS.TOGGLE_BROWSER_VIEW, isOpen),
    onBrowserViewLoading: (callback: (isLoading: boolean) => void) =>
        ipcRenderer.on(IPC_CHANNELS.BROWSER_VIEW_LOADING, (_, isLoading) => callback(isLoading)),
    onBrowserViewError: (
        callback: (error: { errorCode: number; errorDescription: string }) => void
    ) => ipcRenderer.on(IPC_CHANNELS.BROWSER_VIEW_ERROR, (_, error) => callback(error)),
};

// 安全地暴露API到渲染进程
contextBridge.exposeInMainWorld('electronAPI', electronAPI);
