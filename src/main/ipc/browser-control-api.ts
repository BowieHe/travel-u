/**
 * 浏览器控制 API
 * 提供与主进程浏览器控制的通信接口
 */

export interface BrowserControlAPI {
    // 导航到指定URL
    navigateToUrl(url: string, openDrawer?: boolean): Promise<void>;

    // 监听来自主进程的浏览器控制命令
    onBrowserControl(callback: (data: BrowserControlData) => void): void;

    // 清理监听器
    cleanup(): void;
}

export interface BrowserControlData {
    url?: string;
    openDrawer?: boolean;
    action?: 'navigate' | 'back' | 'forward' | 'refresh' | 'home';
}

/**
 * Web 环境的浏览器控制 API 实现
 */
export class WebBrowserControlAPI implements BrowserControlAPI {
    protected controlCallback?: (data: BrowserControlData) => void;

    async navigateToUrl(url: string, openDrawer?: boolean): Promise<void> {
        // 在Web环境中，通过postMessage通知浏览器组件
        window.postMessage({
            type: 'BROWSER_NAVIGATE',
            url,
            openDrawer
        }, '*');
    }

    onBrowserControl(callback: (data: BrowserControlData) => void): void {
        this.controlCallback = callback;
        // Web环境中暂时不需要额外监听
    }

    cleanup(): void {
        this.controlCallback = undefined;
    }
}

/**
 * Electron 环境的浏览器控制 API 实现
 */
export class ElectronBrowserControlAPI extends WebBrowserControlAPI {
    async navigateToUrl(url: string, openDrawer?: boolean): Promise<void> {
        try {
            // 优先使用Electron IPC (暂时注释，等待实现)
            // if (window.electronAPI?.browserControl) {
            //     await window.electronAPI.browserControl.navigate(url, openDrawer);
            // } else {
            // 降级到Web实现
            await super.navigateToUrl(url, openDrawer);
            // }
        } catch (error) {
            console.warn('Electron浏览器控制失败，降级到Web实现:', error);
            await super.navigateToUrl(url, openDrawer);
        }
    }

    onBrowserControl(callback: (data: BrowserControlData) => void): void {
        this.controlCallback = callback;

        // 监听来自主进程的浏览器控制命令 (暂时注释，等待实现)
        // if (window.electronAPI?.browserControl?.onNavigate) {
        //     window.electronAPI.browserControl.onNavigate(callback);
        // }
    }
}

/**
 * 自动检测环境并返回相应的浏览器控制 API 实例
 */
export function createBrowserControlAPI(): BrowserControlAPI {
    // 检测是否在Electron环境
    if (window.electronAPI) {
        return new ElectronBrowserControlAPI();
    }

    // 默认使用Web API
    return new WebBrowserControlAPI();
}
