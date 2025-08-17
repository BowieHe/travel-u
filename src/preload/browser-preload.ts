/**
 * Browser Preload Script
 * 运行在BrowserView中的preload脚本，用于获取页面信息并与主进程通信
 */

import { contextBridge, ipcRenderer } from 'electron';

// 页面信息接口
interface PageInfo {
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    isLoading: boolean;
}

// 发送页面信息到主进程
const sendPageInfo = () => {
    const pageInfo: PageInfo = {
        url: window.location.href,
        title: document.title,
        canGoBack: window.history.length > 1,
        canGoForward: false, // 简化处理，实际需要更复杂的逻辑
        isLoading: document.readyState === 'loading'
    };

    ipcRenderer.send('browser-page-info', pageInfo);
};

// 监听页面加载完成
document.addEventListener('DOMContentLoaded', () => {
    sendPageInfo();
});

// 监听页面完全加载
window.addEventListener('load', () => {
    sendPageInfo();
});

// 监听URL变化（对于SPA应用）
let lastUrl = window.location.href;
const checkUrlChange = () => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        sendPageInfo();
    }
};

// 定期检查URL变化（用于SPA路由）
setInterval(checkUrlChange, 1000);

// 监听标题变化
const titleObserver = new MutationObserver(() => {
    sendPageInfo();
});

titleObserver.observe(document.querySelector('title') || document.head, {
    childList: true,
    subtree: true
});

// 监听历史记录变化
window.addEventListener('popstate', () => {
    setTimeout(sendPageInfo, 100); // 延迟一下等DOM更新
});

// 监听pushState和replaceState
const originalPushState = history.pushState;
const originalReplaceState = history.replaceState;

history.pushState = function (...args) {
    originalPushState.apply(history, args);
    setTimeout(sendPageInfo, 100);
};

history.replaceState = function (...args) {
    originalReplaceState.apply(history, args);
    setTimeout(sendPageInfo, 100);
};

// 暴露API给渲染进程（如果需要的话）
contextBridge.exposeInMainWorld('browserPreload', {
    sendPageInfo,
    getCurrentPageInfo: () => ({
        url: window.location.href,
        title: document.title,
        canGoBack: window.history.length > 1,
        canGoForward: false,
        isLoading: document.readyState === 'loading'
    })
});

console.log('Browser preload script loaded successfully');
