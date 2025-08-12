/**
 * 简单的 Express 服务器，用于 Web 端的聊天 API
 * 这个服务器可以连接到你现有的 LangGraph 服务
 */

import express from 'express';
import cors from 'cors';
import { LangGraphService } from '../main/services/langgraph';

const app = express();
const port = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('dist')); // 提供静态文件

// LangGraph 服务实例
const langGraphService = LangGraphService.getInstance();

// 初始化服务
async function initializeServices() {
    try {
        // 这里需要初始化 MCP 服务等
        await langGraphService.initialize();
        console.log('LangGraph 服务初始化成功');
    } catch (error) {
        console.error('服务初始化失败:', error);
    }
}

// 已移除旧 /api/chat/stream 接口，统一使用 /api/chat/sse

// SSE 聊天接口（Web 独立服务器）
app.get('/api/chat/sse', async (req, res) => {
    try {
        const message = req.query.message as string;
        const resume = req.query.resume === '1';
        if (!message) {
            res.writeHead(400, { 'Content-Type': 'text/event-stream' });
            res.write(`event: error\ndata: ${JSON.stringify({ error: '消息不能为空' })}\n\n`);
            return res.end();
        }

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // @ts-ignore
        if (typeof (res as any).flushHeaders === 'function') {
            (res as any).flushHeaders();
        } else if (typeof (res as any).flush === 'function') {
            (res as any).flush();
        }

        if (!langGraphService.isReady()) {
            await initializeServices();
        }

        const stream = resume
            ? langGraphService.resumeStream(message)
            : langGraphService.streamMessage(message);
        for await (const chunk of stream) {
            res.write(`event: chunk\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
        }
        res.write(`event: done\ndata: {}\n\n`);
        res.end();
    } catch (error: any) {
        console.error('[SSE] 错误:', error);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/event-stream' });
        }
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        langGraphReady: langGraphService.isReady(),
    });
});

// 启动服务器
async function startServer() {
    await initializeServices();

    app.listen(port, () => {
        console.log(`🚀 Web 服务器运行在 http://localhost:${port}`);
        console.log(`📡 聊天 SSE API: http://localhost:${port}/api/chat/sse`);
    });
}

startServer().catch(console.error);

export default app;
