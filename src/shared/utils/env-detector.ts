/**
 * 环境检测工具 - 统一判断是否为 Electron 环境
 */

// 从 Vite 定义的全局变量中获取
const isWeb = typeof (globalThis as any).__VITE_IS_WEB__ !== 'undefined'
    ? (globalThis as any).__VITE_IS_WEB__
    : false;

// 通过 Electron API 存在性判断是否为 Electron 环境
const hasElectronAPI = typeof window !== 'undefined' && window.electronAPI !== undefined;

// 最终的环境判断
export const isElectron = !isWeb && hasElectronAPI;
export const isWebMode = isWeb;

// 导出环境信息用于调试
export const envInfo = {
    isElectron,
    isWebMode,
    viteIsWeb: isWeb,
    hasElectronAPI,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
};

// 调试输出
if (typeof window !== 'undefined') {
    console.log('环境检测结果:', envInfo);
}
