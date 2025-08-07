/**
 * 简单的 Express 服务器，用于 Web 端的聊天 API
 * 这个服务器可以连接到你现有的 LangGraph 服务
 */

import express from "express";
import cors from "cors";
import { LangGraphService } from "../main/services/langgraph";

const app = express();
const port = process.env.PORT || 3001;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static("dist")); // 提供静态文件

// LangGraph 服务实例
const langGraphService = LangGraphService.getInstance();

// 初始化服务
async function initializeServices() {
    try {
        // 这里需要初始化 MCP 服务等
        await langGraphService.initialize();
        console.log("LangGraph 服务初始化成功");
    } catch (error) {
        console.error("服务初始化失败:", error);
    }
}

// 流式聊天 API
app.post("/api/chat/stream", async (req, res) => {
    try {
        const { message } = req.body;

        if (!message) {
            return res.status(400).json({ error: "消息不能为空" });
        }

        // 设置流式响应头
        res.writeHead(200, {
            "Content-Type": "text/plain; charset=utf-8",
            "Transfer-Encoding": "chunked",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });

        // 确保服务已初始化
        if (!langGraphService.isReady()) {
            await initializeServices();
        }

        // 使用 LangGraph 的流式处理
        const stream = langGraphService.streamMessage(message);

        for await (const chunk of stream) {
            // 发送流式数据
            res.write(chunk);
        }

        // 结束响应
        res.end();
    } catch (error: any) {
        console.error("流式处理错误:", error);

        if (!res.headersSent) {
            res.status(500).json({ error: error.message });
        } else {
            res.write(`\n错误: ${error.message}`);
            res.end();
        }
    }
});

// 健康检查
app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        langGraphReady: langGraphService.isReady(),
    });
});

// 启动服务器
async function startServer() {
    await initializeServices();

    app.listen(port, () => {
        console.log(`🚀 Web 服务器运行在 http://localhost:${port}`);
        console.log(`📡 聊天 API: http://localhost:${port}/api/chat/stream`);
    });
}

startServer().catch(console.error);

export default app;
