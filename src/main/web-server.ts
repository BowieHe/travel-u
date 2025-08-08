import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import chatRouter from './api/chat';
import { LangGraphService } from './services/langgraph';
import { McpService } from './services/mcp/mcp';

// 加载环境变量
dotenv.config();

const app = express();
const port = process.env.WEB_PORT || 3001;

// 中间件
app.use(
    cors({
        origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
        credentials: true,
    })
);
app.use(express.json());
app.use(express.static('dist-web')); // 提供静态文件

// API 路由
app.use('/api/chat', chatRouter);

// 健康检查
app.get('/api/health', (req, res) => {
    const langGraphService = LangGraphService.getInstance();
    const mcpService = McpService.getInstance();

    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {
            langGraph: langGraphService.isReady(),
            mcp: mcpService.isReady(),
        },
    });
});

// 根路径
app.get('/', (req, res) => {
    res.json({
        message: 'Travel-U Web API Server',
        version: '1.0.0',
        endpoints: {
            chatSSE: '/api/chat/sse',
            health: '/api/health',
        },
    });
});

/**
 * 初始化所有必要的服务
 */
async function initializeServices() {
    try {
        console.log('🚀 初始化服务...');

        // 先初始化 MCP 服务
        const mcpService = McpService.getInstance();
        if (!mcpService.isReady()) {
            await mcpService.initialize();
            console.log('✅ MCP 服务初始化完成');
        }

        // 再初始化 LangGraph 服务
        const langGraphService = LangGraphService.getInstance();
        if (!langGraphService.isReady()) {
            await langGraphService.initialize();
            console.log('✅ LangGraph 服务初始化完成');
        }

        console.log('🎉 所有服务初始化完成');
    } catch (error) {
        console.error('❌ 服务初始化失败:', error);
        throw error;
    }
}

/**
 * 启动 Web 服务器
 */
async function startServer() {
    try {
        await initializeServices();

        app.listen(port, () => {
            console.log(`🌐 Web 服务器启动成功!`);
            console.log(`📍 服务器地址: http://localhost:${port}`);
            console.log(`💬 聊天 SSE API: http://localhost:${port}/api/chat/sse`);
            console.log(`🏥 健康检查: http://localhost:${port}/api/health`);
        });
    } catch (error) {
        console.error('❌ 服务器启动失败:', error);
        process.exit(1);
    }
}

// 优雅关闭
process.on('SIGINT', () => {
    console.log('\n🛑 收到关闭信号，正在优雅关闭服务器...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 收到终止信号，正在优雅关闭服务器...');
    process.exit(0);
});

// 启动服务器
if (require.main === module) {
    startServer().catch(console.error);
}

export default app;
