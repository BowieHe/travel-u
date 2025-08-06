import { BrowserWindow } from "electron";
import { registerAiHandlers } from "./ai-handler";
import { registerMcpHandlers } from "./mcp-handler";
import { registerBrowserHandlers } from "./browser-handler";

/**
 * 注册所有IPC处理器
 */
export function registerAllHandlers(mainWindow: BrowserWindow): void {
    registerAiHandlers();
    registerMcpHandlers();
    registerBrowserHandlers(mainWindow);
}
