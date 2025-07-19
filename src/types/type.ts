import { BaseMessage } from "@langchain/core/messages";
import { AnyExpertTask, TaskType } from "../utils/task-type";
import {
	TripPlan,
	TransportationType,
	getTripPlanSchema,
} from "@/tools/trip-plan";

/**
 * Represents the state of our LangGraph.
 */
export type AgentNode =
	| "orchestrator"
	| "transportation_specialist"
	| "destination_specialist"
	| "subtask_parser"
	| "summary"
	| "tools"
	| "router"
	| "ask_user";

type Outcome = "success" | "reprompt" | "cancel";

export type SpecialistNode =
	| "transportation_specialist"
	| "destination_specialist"
	| "food_specialist";

export interface AgentState {
	messages: Array<BaseMessage>;
	next: AgentNode | "END" | TaskType;

	// todo)) might be same
	memory: Record<string, any>;
	tripPlan?: TripPlan;
	// for subtasks
	subtask: Array<AnyExpertTask>;
	currentTaskIndex: number;

	currentSpecialist?: SpecialistNode | "END";

	errorMessage?: string;

	userInteractionState?: UserInteractionState;

	// 用户交互是否完成
	user_interaction_complete?: boolean;
}

export interface UserInteractionState {
	messages: Array<BaseMessage>;
	// 从主图传入的问题信息
	questionFromNode?: string;
	// 用户的回复
	userResponse?: string;
	// 子图的处理结果
	interactionOutcome?: Outcome;
	// 提取的信息（返回给主图）
	extractedInfo?: Record<string, string>;
}

// 导出 TripPlanSchema，从工具函数获取
export const TripPlanSchema = getTripPlanSchema();

// 重新导出类型，保持向后兼容
export { TripPlan, TransportationType };
