import { app, BrowserWindow } from 'electron';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { createWindow, cleanupWindow } from './window';
import { McpService } from './services/mcp/mcp';
import { startServer } from './web-server'; // 显式启动内嵌 Web API 服务器

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../../.env') });

let mainWindow: BrowserWindow;
// 已移除 ChatIpcHandler，统一使用 SSE HTTP 通道

/**
 * 应用程序入口点
 */
async function main() {
    await app.whenReady();

    // 1. 启动内嵌 Web API 服务器 (SSE 所需)
    try {
        await startServer();
    } catch (err) {
        console.error('启动内嵌 Web 服务器失败:', err);
    }

    // 2. 创建窗口（SSE 直接访问内嵌 web server）
    mainWindow = createWindow();

    // 3. 后台异步初始化 MCP Client（不阻塞界面）
    initializeMcpClient().catch((error) => {
        console.error('后台初始化 MCP Client 失败:', error);
    });
}

/**
 * 初始化MCP客户端
 */
async function initializeMcpClient(): Promise<void> {
    try {
        const mcpService = McpService.getInstance();
        await mcpService.initialize();

        // // 通知渲染进程MCP初始化完成
        if (mainWindow && !mainWindow.isDestroyed()) {
            // 可以在这里发送 IPC 消息给渲染进程
            // const status = await mcpService.getStatus();
            // mainWindow.webContents.send('mcp-initialized', {
            //     success: true,
            //     toolCount: status.tools.length,
            // });
        }
    } catch (error) {
        console.error('MCP Client Manager 初始化失败:', error);

        // // 通知渲染进程MCP初始化失败
        if (mainWindow && !mainWindow.isDestroyed()) {
            // mainWindow.webContents.send('mcp-initialized', {
            //     success: false,
            //     error: error instanceof Error ? error.message : String(error),
            // });
        }
    }
}

/**
 * 应用程序事件处理
 */
app.on('window-all-closed', () => {
    // 清理窗口资源
    if (mainWindow) {
        cleanupWindow(mainWindow);
    }

    // 清理 MCP Client
    const mcpService = McpService.getInstance();
    mcpService.shutdown().catch(console.error);

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
    }
});

app.on('before-quit', async () => {
    if (mainWindow) {
        cleanupWindow(mainWindow);
    }

    // 无 IPC 聊天需要清理

    // 清理 MCP Client
    const mcpService = McpService.getInstance();
    await mcpService.shutdown();
});

// 启动应用
main().catch(console.error);
