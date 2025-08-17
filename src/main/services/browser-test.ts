// 在main进程中添加这个测试函数
// 比如在 src/main/services/browser-test.ts

import { BrowserViewManager } from './browser-view-manager';
import { BrowserWindow } from 'electron';

export class BrowserTestService {
    private browserViewManager: BrowserViewManager;

    constructor(mainWindow: BrowserWindow) {
        this.browserViewManager = new BrowserViewManager(mainWindow);
    }

    // 测试函数：打开小红书并提取内容
    async testXiaohongshuAnalysis(): Promise<void> {
        try {
            console.log('开始测试小红书页面分析...');

            // 1. 创建BrowserView
            await this.browserViewManager.createBrowserView();
            console.log('BrowserView创建成功');

            // 2. 显示BrowserView
            const bounds = { x: 0, y: 120, width: 800, height: 600 };
            await this.browserViewManager.showBrowserView(bounds);
            console.log('BrowserView显示成功');

            // 3. 导航到小红书
            await this.browserViewManager.navigateToUrl('https://www.xiaohongshu.com/explore');
            console.log('开始导航到小红书...');

            // 4. 等待页面加载，然后提取DOM
            setTimeout(async () => {
                console.log('开始提取DOM内容...');
                await this.browserViewManager.extractDOMContent();
            }, 5000); // 等待5秒确保页面加载完成

        } catch (error) {
            console.error('测试失败:', error);
        }
    }

    // 测试函数：分析携程页面
    async testCtripAnalysis(): Promise<void> {
        try {
            console.log('开始测试携程页面分析...');
            
            await this.browserViewManager.createBrowserView();
            const bounds = { x: 0, y: 120, width: 800, height: 600 };
            await this.browserViewManager.showBrowserView(bounds);
            await this.browserViewManager.navigateToUrl('https://www.ctrip.com');
            
            setTimeout(async () => {
                await this.browserViewManager.extractDOMContent();
            }, 5000);

        } catch (error) {
            console.error('携程测试失败:', error);
        }
    }
}

// 在main/index.ts中使用测试服务
// 在应用启动后调用：
/*
const browserTest = new BrowserTestService(mainWindow);

// 可以通过IPC调用，或者直接调用测试
setTimeout(() => {
    browserTest.testXiaohongshuAnalysis();
}, 2000);
*/