import express, { Request, Response } from 'express';
import { LangGraphService } from '../services/langgraph';

const router = express.Router();

/**
 * 流式聊天 API 路由
 * POST /api/chat/stream
 */
router.post('/stream', async (req: Request, res: Response) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: '消息不能为空且必须是字符串',
            });
        }

        console.log('收到流式聊天请求:', message);

        // 设置流式响应头
        res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        });

        // 获取 LangGraph 服务实例
        const langGraphService = LangGraphService.getInstance();

        // 确保服务已初始化
        if (!langGraphService.isReady()) {
            await langGraphService.initialize();
        }

        // 使用 LangGraph 的流式处理
        const stream = langGraphService.streamMessage(message);

        for await (const chunk of stream) {
            // 发送流式数据到前端
            res.write(chunk);
        }

        // 结束响应
        res.end();
    } catch (error: any) {
        console.error('流式聊天处理错误:', error);

        if (!res.headersSent) {
            res.status(500).json({
                error: '服务器内部错误',
                message: error.message,
            });
        } else {
            // 如果已经开始流式响应，写入错误信息
            res.write(`\n[错误]: ${error.message}`);
            res.end();
        }
    }
});

/**
 * SSE 聊天流式接口
 * GET /api/chat/sse?message=...
 * 使用 Server-Sent Events 推送增量数据
 */
router.get('/sse', async (req: Request, res: Response) => {
    try {
        const message = req.query.message as string;

        if (!message || typeof message !== 'string') {
            res.writeHead(400, { 'Content-Type': 'text/event-stream' });
            res.write(`event: error\ndata: ${JSON.stringify({ error: '消息不能为空' })}\n\n`);
            return res.end();
        }

        console.log('[SSE] 收到聊天请求:', message);

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Access-Control-Allow-Origin', '*');
        // 立即刷新头部
        // @ts-ignore flushHeaders 在部分实现可用
        if (typeof (res as any).flushHeaders === 'function') {
            (res as any).flushHeaders();
        } else if (typeof (res as any).flush === 'function') {
            (res as any).flush();
        }

        const langGraphService = LangGraphService.getInstance();
        if (!langGraphService.isReady()) {
            await langGraphService.initialize();
        }

        const stream = langGraphService.streamMessage(message);
        for await (const chunk of stream) {
            // 逐条发送 JSON 包装的内容
            res.write(`event: chunk\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
        }

        res.write(`event: done\ndata: {}\n\n`);
        res.end();
    } catch (error: any) {
        console.error('[SSE] 流式聊天错误:', error);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/event-stream' });
        }
        res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
        res.end();
    }
});

/**
 * 处理 OPTIONS 预检请求（CORS）
 */
router.options('/stream', (req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(200).end();
});

export default router;
