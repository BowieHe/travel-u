import { BaseMessage } from "@langchain/core/messages";
import { AnyExpertTask, TaskType } from "../utils/task-type";
import { z } from "zod";

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

export const TransportationEnum = z.enum(["flight", "train", "car"]);
export type TransportationType = z.infer<typeof TransportationEnum>;

export interface TripPlan {
	destination?: string;
	departure?: string;
	startDate?: string;
	endDate?: string;
	transportation?: TransportationType;
	budget?: number;
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

export const TripPlanSchema = z.object({
	destination: z.string().optional().describe("用户希望前往的目的地。"),
	departure: z.string().optional().describe("用户的出发城市或地点。"),
	startDate: z
		.string()
		.optional()
		.describe(
			"旅行的开始日期，可以是自然语言描述（如 '下个月', '七月十五号'）。"
		),
	endDate: z
		.string()
		.optional()
		.describe("旅行的结束日期或持续时间（如 '一周', '七月二十二号'）。"),
	budget: z.number().optional().describe("旅行的大致预算，请尝试提取数字。"),
	transportation: TransportationEnum.optional().describe(
		"用户偏好的交通方式（如 '飞机', '火车', '汽车'）。"
	),
	// numTravelers: z.number().int().optional().describe("旅行的人数。"),
	// interests: z
	// 	.array(z.string())
	// 	.optional()
	// 	.describe(
	// 		"用户在旅行中的兴趣点或偏好（如 '徒步', '博物馆', '美食'）。"
	// 	),
});
