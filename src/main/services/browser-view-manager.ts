/**
 * BrowserView管理服务
 * 负责创建、管理和控制BrowserView实例
 */

import { BrowserView, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

export interface BrowserViewBounds {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PageInfo {
    url: string;
    title: string;
    canGoBack: boolean;
    canGoForward: boolean;
    isLoading: boolean;
}

export class BrowserViewManager {
    private browserView: BrowserView | null = null;
    private mainWindow: BrowserWindow | null = null;
    private isVisible = false;

    constructor(mainWindow: BrowserWindow) {
        this.mainWindow = mainWindow;
        this.setupIpcHandlers();
    }

    /**
     * 创建BrowserView实例
     */
    createBrowserView(): void {
        if (this.browserView) {
            this.destroyBrowserView();
        }

        this.browserView = new BrowserView({
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                preload: path.join(__dirname, '../preload/browser-preload.js'), // 编译后的路径
                webSecurity: true,
                allowRunningInsecureContent: false,
            }
        });

        // 监听BrowserView的页面信息
        this.browserView.webContents.on('did-finish-load', () => {
            this.sendToRenderer('browser-loading-finished');
        });

        this.browserView.webContents.on('did-start-loading', () => {
            this.sendToRenderer('browser-loading-started');
        });

        this.browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
            this.sendToRenderer('browser-load-failed', {
                errorCode,
                errorDescription,
                url: validatedURL
            });
        });

        // 监听导航事件
        this.browserView.webContents.on('did-navigate', (event, url) => {
            this.sendToRenderer('browser-navigated', { url });
        });

        this.browserView.webContents.on('did-navigate-in-page', (event, url) => {
            this.sendToRenderer('browser-navigated', { url });
        });
    }

    /**
     * 显示BrowserView
     */
    showBrowserView(bounds: BrowserViewBounds): void {
        if (!this.browserView || !this.mainWindow) return;

        this.mainWindow.setBrowserView(this.browserView);
        this.browserView.setBounds(bounds);
        this.isVisible = true;
    }

    /**
     * 隐藏BrowserView
     */
    hideBrowserView(): void {
        if (!this.mainWindow) return;

        this.mainWindow.setBrowserView(null);
        this.isVisible = false;
    }

    /**
     * 更新BrowserView边界
     */
    updateBounds(bounds: BrowserViewBounds): void {
        if (!this.browserView || !this.isVisible) return;

        this.browserView.setBounds(bounds);
    }

    /**
     * 导航到指定URL
     */
    navigateToUrl(url: string): void {
        if (!this.browserView) return;

        this.browserView.webContents.loadURL(url);
    }

    /**
     * 后退
     */
    goBack(): void {
        if (!this.browserView) return;

        if (this.browserView.webContents.canGoBack()) {
            this.browserView.webContents.goBack();
        }
    }

    /**
     * 前进
     */
    goForward(): void {
        if (!this.browserView) return;

        if (this.browserView.webContents.canGoForward()) {
            this.browserView.webContents.goForward();
        }
    }

    /**
     * 刷新
     */
    reload(): void {
        if (!this.browserView) return;

        this.browserView.webContents.reload();
    }

    /**
     * 停止加载
     */
    stop(): void {
        if (!this.browserView) return;

        this.browserView.webContents.stop();
    }

    /**
     * 获取当前URL
     */
    getCurrentUrl(): string {
        if (!this.browserView) return '';

        return this.browserView.webContents.getURL();
    }

    /**
     * 获取当前标题
     */
    getCurrentTitle(): string {
        if (!this.browserView) return '';

        return this.browserView.webContents.getTitle();
    }

    /**
     * 检查是否可以后退
     */
    canGoBack(): boolean {
        if (!this.browserView) return false;

        return this.browserView.webContents.canGoBack();
    }

    /**
     * 检查是否可以前进
     */
    canGoForward(): boolean {
        if (!this.browserView) return false;

        return this.browserView.webContents.canGoForward();
    }

    /**
     * 检查是否正在加载
     */
    isLoading(): boolean {
        if (!this.browserView) return false;

        return this.browserView.webContents.isLoading();
    }

    /**
     * 销毁BrowserView
     */
    destroyBrowserView(): void {
        if (this.browserView) {
            if (this.mainWindow) {
                this.mainWindow.setBrowserView(null);
            }
            // BrowserView会被垃圾回收自动清理
            this.browserView = null;
            this.isVisible = false;
        }
    }

    /**
     * 发送消息到渲染进程
     */
    private sendToRenderer(channel: string, data?: any): void {
        if (!this.mainWindow) return;

        this.mainWindow.webContents.send(channel, data);
    }

    /**
     * 设置IPC处理器
     */
    private setupIpcHandlers(): void {
        // 监听来自browser preload的页面信息
        ipcMain.on('browser-page-info', (event, pageInfo: PageInfo) => {
            this.sendToRenderer('browser-page-info-updated', pageInfo);
        });

        // 处理来自渲染进程的BrowserView控制请求
        ipcMain.handle('browser-view-create', () => {
            this.createBrowserView();
            return { success: true };
        });

        ipcMain.handle('browser-view-show', (event, bounds: BrowserViewBounds) => {
            this.showBrowserView(bounds);
            return { success: true };
        });

        ipcMain.handle('browser-view-hide', () => {
            this.hideBrowserView();
            return { success: true };
        });

        ipcMain.handle('browser-view-update-bounds', (event, bounds: BrowserViewBounds) => {
            this.updateBounds(bounds);
            return { success: true };
        });

        ipcMain.handle('browser-view-navigate', (event, url: string) => {
            this.navigateToUrl(url);
            return { success: true };
        });

        ipcMain.handle('browser-view-go-back', () => {
            this.goBack();
            return { success: true };
        });

        ipcMain.handle('browser-view-go-forward', () => {
            this.goForward();
            return { success: true };
        });

        ipcMain.handle('browser-view-reload', () => {
            this.reload();
            return { success: true };
        });

        ipcMain.handle('browser-view-stop', () => {
            this.stop();
            return { success: true };
        });

        ipcMain.handle('browser-view-get-info', () => {
            return {
                url: this.getCurrentUrl(),
                title: this.getCurrentTitle(),
                canGoBack: this.canGoBack(),
                canGoForward: this.canGoForward(),
                isLoading: this.isLoading()
            };
        });
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        this.destroyBrowserView();
        ipcMain.removeAllListeners('browser-page-info');
        ipcMain.removeHandler('browser-view-create');
        ipcMain.removeHandler('browser-view-show');
        ipcMain.removeHandler('browser-view-hide');
        ipcMain.removeHandler('browser-view-update-bounds');
        ipcMain.removeHandler('browser-view-navigate');
        ipcMain.removeHandler('browser-view-go-back');
        ipcMain.removeHandler('browser-view-go-forward');
        ipcMain.removeHandler('browser-view-reload');
        ipcMain.removeHandler('browser-view-stop');
        ipcMain.removeHandler('browser-view-get-info');
    }
}
