import { BaseMessage } from "@langchain/core/messages";

export interface AgentState {
	messages: BaseMessage[];
	next: string;
	tripPlan: Record<string, any>;
	memory: Record<string, any>;
	subtask: any[];
	currentTaskIndex: number;
	user_interaction_complete: boolean;
}

export interface McpStatus {
	initialized: boolean;
	tools: Array<{ name: string; description: string }>;
	error?: string;
}

export interface McpInitializedEvent {
	success: boolean;
	toolCount?: number;
	error?: string;
}
