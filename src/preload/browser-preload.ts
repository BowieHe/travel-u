/**
 * Browser Preload Script
 * 运行在BrowserView中的preload脚本，用于获取页面信息并与主进程通信
 */

import { contextBridge, ipcRenderer } from 'electron';

console.log('Browser preload script starting...');

// 页面信息接口
interface PageInfo {
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    isLoading: boolean;
}

// DOM内容提取接口
interface DOMContent {
    text: string;
    links: Array<{ text: string; href: string }>;
    images: Array<{ alt: string; src: string }>;
    headings: Array<{ level: number; text: string }>;
    articles: Array<{ title: string; content: string }>;
}

// 发送页面信息到主进程
const sendPageInfo = () => {
    try {
        const pageInfo: PageInfo = {
            url: window.location.href,
            title: document.title || 'Untitled',
            canGoBack: window.history.length > 1,
            canGoForward: false, // 简化处理
            isLoading: document.readyState === 'loading'
        };

        console.log('Browser preload: 发送页面信息', pageInfo);
        ipcRenderer.send('browser-page-info', pageInfo);
    } catch (error) {
        console.error('Browser preload: 发送页面信息失败', error);
    }
};

// 提取页面DOM内容
const extractDOMContent = (): DOMContent => {
    try {
        console.log('Browser preload: 开始提取DOM内容');
        
        // 提取主要文本内容
        const mainContent = document.querySelector('main, article, .content, #content, .main') 
            || document.body;
        const text = mainContent?.innerText?.slice(0, 5000) || document.body.innerText.slice(0, 5000) || '';

        // 提取链接
        const linkElements = document.querySelectorAll('a[href]');
        const links = Array.from(linkElements).slice(0, 20).map(link => ({
            text: (link as HTMLAnchorElement).innerText.trim().slice(0, 100) || '',
            href: (link as HTMLAnchorElement).href || ''
        })).filter(link => link.text && link.href);

        // 提取图片
        const imgElements = document.querySelectorAll('img[src]');
        const images = Array.from(imgElements).slice(0, 10).map(img => ({
            alt: (img as HTMLImageElement).alt || '',
            src: (img as HTMLImageElement).src || ''
        }));

        // 提取标题
        const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
        const headings = Array.from(headingElements).slice(0, 10).map(heading => ({
            level: parseInt(heading.tagName.charAt(1)),
            text: heading.textContent?.trim().slice(0, 200) || ''
        })).filter(heading => heading.text);

        // 提取文章内容（针对内容网站）
        const articleElements = document.querySelectorAll('article, .post, .entry, .article');
        const articles = Array.from(articleElements).slice(0, 3).map(article => ({
            title: article.querySelector('h1, h2, .title')?.textContent?.trim().slice(0, 100) || '',
            content: article.textContent?.trim().slice(0, 1000) || ''
        })).filter(article => article.content);

        const content = {
            text,
            links,
            images,
            headings,
            articles
        };

        console.log('Browser preload: DOM内容提取完成', content);
        return content;
    } catch (error) {
        console.error('Browser preload: DOM内容提取失败', error);
        return {
            text: '',
            links: [],
            images: [],
            headings: [],
            articles: []
        };
    }
};

// DOM加载完成时发送页面信息
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('Browser preload: DOMContentLoaded');
        sendPageInfo();
    });
} else {
    // 如果DOM已经加载完成
    sendPageInfo();
}

// 页面完全加载时发送信息
window.addEventListener('load', () => {
    console.log('Browser preload: window load');
    sendPageInfo();
});

// 监听来自主进程的DOM内容提取请求
ipcRenderer.on('extract-dom-content', () => {
    console.log('Browser preload: 收到DOM提取请求');
    const content = extractDOMContent();
    ipcRenderer.send('dom-content-extracted', content);
});

// 暴露API给渲染进程（如果需要的话）
try {
    contextBridge.exposeInMainWorld('browserPreload', {
        sendPageInfo,
        getCurrentPageInfo: () => ({
            url: window.location.href,
            title: document.title,
            canGoBack: window.history.length > 1,
            canGoForward: false,
            isLoading: document.readyState === 'loading'
        }),
        extractDOMContent
    });
    console.log('Browser preload: contextBridge API exposed successfully');
} catch (error) {
    console.error('Browser preload: contextBridge API 暴露失败', error);
}

console.log('Browser preload script loaded successfully');
