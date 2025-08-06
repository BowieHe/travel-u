import * as path from "path";
import { initFromConfig, getMcpClientManager } from "@/core/mcp/mcp-client";

export class McpService {
	private static instance: McpService | null = null;
	private mcpClientManager: any = null;
	private isInitialized = false;
	private initializationPromise: Promise<void> | null = null;

	private constructor() {}

	static getInstance(): McpService {
		if (!McpService.instance) {
			McpService.instance = new McpService();
		}
		return McpService.instance;
	}

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
			console.log("环境变量检查:");
			console.log(
				"VARIFLIGHT_KEY:",
				process.env.VARIFLIGHT_KEY ? "已设置" : "未定义"
			);
			console.log(
				"AMAP_WEB_API:",
				process.env.AMAP_WEB_API ? "已设置" : "未定义"
			);
			console.log(
				"OPENAI_API_KEY:",
				process.env.OPENAI_API_KEY ? "已设置" : "未定义"
			);

			const configPath = path.join(
				__dirname,
				"../../config/mcp-servers.json"
			);
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

	isReady(): boolean {
		return this.isInitialized && this.mcpClientManager !== null;
	}

	getClientManager() {
		return this.mcpClientManager;
	}

	async getStatus() {
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
