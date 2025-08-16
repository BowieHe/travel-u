/**
 * 环境检测工具 - 仅判断是否为 Electron 环境
 */

// 通过 Electron API 存在性判断是否为 Electron 环境
const hasElectronAPI = typeof window !== 'undefined' && window.electronAPI !== undefined;

// 最终的环境判断（现在只有 Electron 模式）
export const isElectron = hasElectronAPI;

// 导出环境信息用于调试
export const envInfo = {
    isElectron,
    hasElectronAPI,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
};

// 调试输出
if (typeof window !== 'undefined') {
    console.log('环境检测结果:', envInfo);
}