// 在主进程中使用浏览器控制服务的示例

import { BrowserIpcHandler } from '../ipc/browser-handler';

// 获取浏览器IPC处理器实例
const browserIpcHandler = new BrowserIpcHandler();

// 示例用法：

// 1. 访问携程网站
export async function openCtripWebsite() {
    const browserControl = browserIpcHandler.getBrowserControlService();
    await browserControl.openCtrip();
    console.log('已打开携程网站');
}

// 2. 访问小红书
export async function visitRedNote() {
    const browserControl = browserIpcHandler.getBrowserControlService();
    await browserControl.visitRedNote();
    console.log('已打开小红书');
}

// 3. 访问自定义网站
export async function visitCustomWebsite(url: string) {
    const browserControl = browserIpcHandler.getBrowserControlService();
    await browserControl.visitWebsite(url, true);
    console.log(`已打开网站: ${url}`);
}

// 4. 在AI代理或其他服务中使用
export class TravelAssistantService {
    private browserControl: any;

    constructor(browserIpcHandler: BrowserIpcHandler) {
        this.browserControl = browserIpcHandler.getBrowserControlService();
    }

    async searchHotels(destination: string) {
        // 打开携程酒店搜索页面
        const ctripHotelUrl = `https://hotels.ctrip.com/hotels/list?city=${encodeURIComponent(destination)}`;
        await this.browserControl.visitWebsite(ctripHotelUrl, true);
    }

    async searchFlights(from: string, to: string) {
        // 打开携程机票搜索页面
        const ctripFlightUrl = `https://flights.ctrip.com/online/list/oneway-${encodeURIComponent(from)}-${encodeURIComponent(to)}`;
        await this.browserControl.visitWebsite(ctripFlightUrl, true);
    }

    async exploreDestination(destination: string) {
        // 在小红书搜索目的地攻略
        const redNoteUrl = `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(destination + ' 旅游攻略')}`;
        await this.browserControl.visitWebsite(redNoteUrl, true);
    }

    async searchOnMafengwo(destination: string) {
        // 在马蜂窝搜索目的地信息
        const mafengwoUrl = `https://www.mafengwo.cn/search/q.php?q=${encodeURIComponent(destination)}`;
        await this.browserControl.visitWebsite(mafengwoUrl, true);
    }
}

// 使用示例:
// const travelAssistant = new TravelAssistantService(browserIpcHandler);
// await travelAssistant.searchHotels('北京');
// await travelAssistant.exploreDestination('杭州西湖');
