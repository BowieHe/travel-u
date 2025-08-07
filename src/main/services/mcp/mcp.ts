import * as path from "path";
import { initFromConfig, getMcpClientManager } from "./client";
import { McpStatus } from "@shared/types/mcp";
import { EnvUtils } from "../utils/env";

/**
 * MCP 客户端管理服务
 * 提供单例模式的 MCP 客户端管理
 */
export class McpService {
    private static instance: McpService | null = null;
    private mcpClientManager: any = null;
    private isInitialized = false;
    private initializationPromise: Promise<void> | null = null;

    private constructor() { }

    static getInstance(): McpService {
        if (!McpService.instance) {
            McpService.instance = new McpService();
        }
        return McpService.instance;
    }

    /**
     * 初始化 MCP 客户端
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this.doInitialize();
        return this.initializationPromise;
    }

    private async doInitialize(): Promise<void> {
        try {
            console.log("初始化 MCP Client Manager...");

            // 检查环境变量
            const envStatus = EnvUtils.checkRequired([
                "VARIFLIGHT_KEY",
                "AMAP_WEB_API",
                "OPENAI_API_KEY",
            ]);
            console.log("环境变量检查:", envStatus);

            const configPath = EnvUtils.getConfigPath()
            // const configPath = path.join(
            //     __dirname,
            //     "../config/mcp-servers.json"
            // );
            this.mcpClientManager = await initFromConfig(configPath);
            console.log("MCP Client Manager 初始化成功");

            // 列出所有可用工具
            const tools = await this.mcpClientManager.listTools();
            console.log(
                "可用的 MCP 工具:",
                tools.map((tool: any) => tool.name).join(", ")
            );

            this.isInitialized = true;
        } catch (error) {
            console.error("MCP Client Manager 初始化失败:", error);
            throw error;
        }
    }

    /**
     * 检查是否已准备就绪
     */
    isReady(): boolean {
        return this.isInitialized && this.mcpClientManager !== null;
    }

    /**
     * 获取客户端管理器
     */
    getClientManager() {
        return this.mcpClientManager;
    }

    /**
     * 获取 MCP 状态
     */
    async getStatus(): Promise<McpStatus> {
        try {
            if (!this.mcpClientManager) {
                return { initialized: false, tools: [] };
            }
            const tools = await this.mcpClientManager.listTools();
            return {
                initialized: true,
                tools: tools.map((tool: any) => ({
                    name: tool.name,
                    description: tool.description,
                    mcpName: tool.mcpName,
                    inputSchema: tool.inputSchema,
                })),
            };
        } catch (error) {
            return {
                initialized: false,
                error: error instanceof Error ? error.message : String(error),
                tools: [],
            };
        }
    }

    /**
     * 关闭所有 MCP 客户端
     */
    async shutdown(): Promise<void> {
        if (this.mcpClientManager) {
            try {
                await this.mcpClientManager.shutdown();
                console.log("MCP Client Manager 已清理");
            } catch (error) {
                console.error("清理 MCP Client Manager 时出错:", error);
            }
        }
        this.mcpClientManager = null;
        this.isInitialized = false;
        this.initializationPromise = null;
    }
}
