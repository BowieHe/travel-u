import { ipcMain, BrowserWindow } from 'electron';
import { BrowserControlService } from '../services/browser-control';

/**
 * 浏览器控制 IPC 处理器
 * 处理来自渲染进程的浏览器控制请求
 */

export class BrowserIpcHandler {
    private browserControl: BrowserControlService;

    constructor() {
        this.browserControl = BrowserControlService.getInstance();
        this.setupIpcHandlers();
    }

    /**
     * 设置主窗口引用
     */
    setMainWindow(window: BrowserWindow): void {
        this.browserControl.setMainWindow(window);
    }

    /**
     * 设置IPC处理器
     */
    private setupIpcHandlers(): void {
        // 导航到指定URL
        ipcMain.handle('browser:navigate', async (event, url: string, openDrawer: boolean = true) => {
            try {
                await this.browserControl.navigateToUrl(url, openDrawer);
                return { success: true };
            } catch (error: any) {
                console.error('浏览器导航失败:', error);
                return { success: false, error: error.message };
            }
        });

        // 访问携程
        ipcMain.handle('browser:open-ctrip', async () => {
            try {
                await this.browserControl.openCtrip();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 访问小红书
        ipcMain.handle('browser:visit-red-note', async () => {
            try {
                await this.browserControl.visitRedNote();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 访问马蜂窝
        ipcMain.handle('browser:open-mafengwo', async () => {
            try {
                await this.browserControl.openMafengwo();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 访问去哪儿
        ipcMain.handle('browser:open-qunar', async () => {
            try {
                await this.browserControl.openQunar();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 访问途牛
        ipcMain.handle('browser:open-tuniu', async () => {
            try {
                await this.browserControl.openTuniu();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 访问飞猪
        ipcMain.handle('browser:open-fliggy', async () => {
            try {
                await this.browserControl.openFliggy();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 通用网站访问
        ipcMain.handle('browser:visit-website', async (event, url: string, openDrawer: boolean = true) => {
            try {
                await this.browserControl.visitWebsite(url, openDrawer);
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 浏览器操作 - 后退
        ipcMain.handle('browser:go-back', async () => {
            try {
                await this.browserControl.goBack();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 浏览器操作 - 前进
        ipcMain.handle('browser:go-forward', async () => {
            try {
                await this.browserControl.goForward();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 浏览器操作 - 刷新
        ipcMain.handle('browser:refresh', async () => {
            try {
                await this.browserControl.refresh();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });

        // 浏览器操作 - 回到首页
        ipcMain.handle('browser:go-home', async () => {
            try {
                await this.browserControl.goHome();
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });
    }

    /**
     * 清理IPC处理器
     */
    cleanup(): void {
        ipcMain.removeAllListeners('browser:navigate');
        ipcMain.removeAllListeners('browser:open-ctrip');
        ipcMain.removeAllListeners('browser:visit-red-note');
        ipcMain.removeAllListeners('browser:open-mafengwo');
        ipcMain.removeAllListeners('browser:open-qunar');
        ipcMain.removeAllListeners('browser:open-tuniu');
        ipcMain.removeAllListeners('browser:open-fliggy');
        ipcMain.removeAllListeners('browser:visit-website');
        ipcMain.removeAllListeners('browser:go-back');
        ipcMain.removeAllListeners('browser:go-forward');
        ipcMain.removeAllListeners('browser:refresh');
        ipcMain.removeAllListeners('browser:go-home');
    }

    /**
     * 获取浏览器控制服务实例（用于外部调用）
     */
    getBrowserControlService(): BrowserControlService {
        return this.browserControl;
    }
}
