import { McpStatus, McpInitializedEvent } from './mcp';

/**
 * Electron API 接口定义 - 只保留必要的功能
 */
export interface ElectronAPI {
    // 系统信息
    getVersion: () => string;
    getPlatform: () => string;

    // MCP 状态
    getMcpStatus: () => Promise<McpStatus>;
    onMcpInitialized: (callback: (status: McpInitializedEvent) => void) => void;

    // 地图配置
    getMapConfig: () => { amapKey: string };

    // BrowserView 控制
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
