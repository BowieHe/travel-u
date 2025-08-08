import { contextBridge, ipcRenderer } from 'electron';
import { ElectronAPI } from '@shared/types/ipc';
import { McpInitializedEvent } from '@shared/types/mcp';
import { IPC_CHANNELS } from '@shared/constants/config';

/**
 * 预加载脚本 - 安全地暴露Electron API到渲染进程
 */

const electronAPI: ElectronAPI = {
    // 系统信息
    getVersion: () => process.versions.electron,
    getPlatform: () => process.platform,

    // （已移除聊天 IPC，前端直接通过 SSE 调用后端）

    // MCP 状态
    getMcpStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_MCP_STATUS),
    onMcpInitialized: (callback: (status: McpInitializedEvent) => void) =>
        ipcRenderer.on(IPC_CHANNELS.MCP_INITIALIZED, (_, status) => callback(status)),

    // 地图配置
    getMapConfig: () => ({
        amapKey: process.env.AMAP_WEB_API || 'YOUR_AMAP_KEY_HERE',
    }),

    // BrowserView 控制
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
