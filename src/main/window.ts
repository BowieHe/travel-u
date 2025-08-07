import { BrowserWindow, shell } from "electron";
import { join } from "node:path";

export function createWindow(): BrowserWindow {
    // 创建浏览器窗口
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: join(__dirname, "../preload/index.js"),
            sandbox: false,
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.on("ready-to-show", () => {
        mainWindow.show();
    });

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url);
        return { action: "deny" };
    });

    // 判断是否为开发环境
    const isDev = process.env.NODE_ENV === "development";

    // 根据环境加载不同的内容
    if (isDev && process.env["ELECTRON_RENDERER_URL"]) {
        // 开发环境：加载开发服务器
        mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
    } else {
        // 生产环境：加载构建后的文件
        mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
    }

    // 开发环境下打开开发者工具
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    return mainWindow;
}

export function cleanupWindow(window: BrowserWindow): void {
    if (!window.isDestroyed()) {
        window.destroy();
    }
}
