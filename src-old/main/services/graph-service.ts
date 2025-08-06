import { initializeGraph } from "@/core/graph/graph";
import { HumanMessage } from "@langchain/core/messages";
import { AgentState } from "@/shared/types/conversation";

export class GraphService {
	private static instance: GraphService | null = null;
	private travelGraph: any = null;
	private isInitialized = false;

	private conversationState: AgentState = {
		messages: [],
		next: "orchestrator",
		tripPlan: {},
		memory: {},
		subtask: [],
		currentTaskIndex: 0,
		user_interaction_complete: false,
	};

	private constructor() {}

	static getInstance(): GraphService {
		if (!GraphService.instance) {
			GraphService.instance = new GraphService();
		}
		return GraphService.instance;
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		try {
			console.log("初始化 LangGraph...");
			this.travelGraph = await initializeGraph();
			this.isInitialized = true;
			console.log("LangGraph 初始化成功");
		} catch (error) {
			console.error("LangGraph 初始化失败:", error);
			throw error;
		}
	}

	async processMessage(message: string): Promise<string> {
		// 确保图已初始化
		if (!this.isInitialized) {
			await this.initialize();
		}

		try {
			// 创建用户消息
			const userMessage = new HumanMessage({ content: message });

			// 更新对话状态
			this.conversationState.messages = [
				...this.conversationState.messages,
				userMessage,
			];

			// 调用图处理消息
			console.log("调用 LangGraph 处理消息...");
			const result = await this.travelGraph.invoke(
				this.conversationState,
				{
					configurable: { thread_id: "travel-chat-session" },
				}
			);

			// 更新对话状态
			this.conversationState = { ...this.conversationState, ...result };

			// 获取最后一条 AI 消息作为回复
			const lastMessage = result.messages[result.messages.length - 1];
			const aiResponse =
				lastMessage?.content || "抱歉，我遇到了一些问题，请重试。";

			return aiResponse;
		} catch (error) {
			console.error("LangGraph 处理消息错误:", error);
			throw error;
		}
	}

	getConversationState(): AgentState {
		return { ...this.conversationState };
	}

	resetConversation(): void {
		this.conversationState = {
			messages: [],
			next: "orchestrator",
			tripPlan: {},
			memory: {},
			subtask: [],
			currentTaskIndex: 0,
			user_interaction_complete: false,
		};
	}
}
