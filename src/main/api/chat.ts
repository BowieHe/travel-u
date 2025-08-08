import express, { Request, Response } from 'express';
import { LangGraphService } from '../services/langgraph';

const router = express.Router();

// 已移除旧 POST /stream 端点，统一使用 SSE

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

// 无需再提供 /stream 预检

export default router;
