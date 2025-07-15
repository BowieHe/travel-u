import { BaseMessage } from "@langchain/core/messages";
import { AnyExpertTask, TaskType } from "./utils/task-type";

/**
 * Represents the state of our LangGraph.
 */
export type AgentNode =
	| "orchestrator"
	| "transportation_specialist"
	| "destination_specialist"
	| "subtask_parser"
	| "tools"
	| "router"
	| "ask_user";

export interface AgentState {
	messages: Array<BaseMessage>;
	next: AgentNode | "END" | TaskType;
	tripPlan?: TripPlan;
	subtask: Array<AnyExpertTask>;
	currentTaskIndex: number;
	memory: Record<string, any>;
	current_specialist?:
		| "transportation_specialist"
		| "destination_specialist"
		| "END";
	error_message?: string; // 用于存储错误信息
}

// 结构化的旅行计划
interface TripPlan {
	destination?: string;
	departure_city?: string;
	travel_dates?: { start: string; end: string };
	transportation_mode?: "flight" | "train" | "car";
	budget?: number;
	// ... 更多关键信息
}
