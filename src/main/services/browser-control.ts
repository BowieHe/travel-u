import { BrowserWindow } from 'electron';

/**
 * 浏览器控制服务
 * 处理主进程对渲染进程浏览器的控制
 */
export class BrowserControlService {
    private static instance: BrowserControlService | null = null;
    private mainWindow: BrowserWindow | null = null;

    private constructor() { }

    static getInstance(): BrowserControlService {
        if (!BrowserControlService.instance) {
            BrowserControlService.instance = new BrowserControlService();
        }
        return BrowserControlService.instance;
    }

    /**
     * 设置主窗口引用
     */
    setMainWindow(window: BrowserWindow): void {
        this.mainWindow = window;
    }

    /**
     * 控制浏览器导航到指定URL
     */
    async navigateToUrl(url: string, openDrawer: boolean = true): Promise<void> {
        if (!this.mainWindow) {
            console.warn('主窗口未设置，无法控制浏览器');
            return;
        }

        try {
            // 发送消息到渲染进程控制浏览器
            this.mainWindow.webContents.postMessage('browser-control', {
                action: 'navigate',
                url,
                openDrawer
            });

            console.log(`浏览器控制: 导航到 ${url}, 打开抽屉: ${openDrawer}`);
        } catch (error) {
            console.error('浏览器控制失败:', error);
        }
    }

    /**
     * 访问携程网站
     */
    async openCtrip(): Promise<void> {
        await this.navigateToUrl('https://www.ctrip.com/');
    }

    /**
     * 访问小红书
     */
    async visitRedNote(): Promise<void> {
        await this.navigateToUrl('https://www.xiaohongshu.com/explore');
    }

    /**
     * 访问马蜂窝
     */
    async openMafengwo(): Promise<void> {
        await this.navigateToUrl('https://www.mafengwo.cn/');
    }

    /**
     * 访问去哪儿网
     */
    async openQunar(): Promise<void> {
        await this.navigateToUrl('https://www.qunar.com/');
    }

    /**
     * 访问途牛
     */
    async openTuniu(): Promise<void> {
        await this.navigateToUrl('https://www.tuniu.com/');
    }

    /**
     * 访问飞猪
     */
    async openFliggy(): Promise<void> {
        await this.navigateToUrl('https://www.fliggy.com/');
    }

    /**
     * 通用网站访问方法
     */
    async visitWebsite(url: string, openDrawer: boolean = true): Promise<void> {
        await this.navigateToUrl(url, openDrawer);
    }

    /**
     * 浏览器操作 - 后退
     */
    async goBack(): Promise<void> {
        if (!this.mainWindow) return;

        this.mainWindow.webContents.postMessage('browser-control', {
            action: 'back'
        });
    }

    /**
     * 浏览器操作 - 前进
     */
    async goForward(): Promise<void> {
        if (!this.mainWindow) return;

        this.mainWindow.webContents.postMessage('browser-control', {
            action: 'forward'
        });
    }

    /**
     * 浏览器操作 - 刷新
     */
    async refresh(): Promise<void> {
        if (!this.mainWindow) return;

        this.mainWindow.webContents.postMessage('browser-control', {
            action: 'refresh'
        });
    }

    /**
     * 浏览器操作 - 回到首页
     */
    async goHome(): Promise<void> {
        if (!this.mainWindow) return;

        this.mainWindow.webContents.postMessage('browser-control', {
            action: 'home'
        });
    }
}
