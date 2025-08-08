import { BaseMessage } from "@langchain/core/messages";
import { AnyExpertTask, TaskType } from "../utils/task-type";

export type AgentNode =
    | "orchestrator"
    | "transportation_specialist"
    | "destination_specialist"
    | "subtask_parser"
    | "summary"
    | "tools"
    | "router"
    | "ask_user";

export type UserNode = "ask_user" | "process_response" | "reletive_time";

type Outcome = "success" | "reprompt" | "cancel";

export type SpecialistNode =
    | "transportation_specialist"
    | "destination_specialist"
    | "food_specialist";

export interface AgentState {
    messages: Array<BaseMessage>;
    next: AgentNode | "END" | TaskType | UserNode;

    // todo)) might be same
    memory: Record<string, any>;
    tripPlan?: TripPlan;
    // for subtasks
    subtask: Array<AnyExpertTask>;
    currentTaskIndex: number;

    currentSpecialist?: SpecialistNode | "END";

    errorMessage?: string;

    // userInteractionState?: UserInteractionState;

    // 用户交互是否完成
    user_interaction_complete?: boolean;
    
    // 计划/任务列表
    planTodos?: PlanTodo[];
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

export interface TripPlan {
    destination?: string;
    startDate?: string;
    endDate?: string;
    budget?: number;
    travelers?: number;
    preferences?: string[];
    itinerary?: ItineraryItem[];
}

export interface ItineraryItem {
    day: number;
    date: string;
    activities: Activity[];
    transportation?: Transportation;
    accommodation?: Accommodation;
}

export interface Activity {
    time: string;
    title: string;
    description: string;
    location: string;
    cost?: number;
    duration?: number;
    type:
        | "sightseeing"
        | "dining"
        | "entertainment"
        | "shopping"
        | "transportation"
        | "other";
}

export interface Transportation {
    type: "flight" | "train" | "bus" | "car" | "taxi" | "subway" | "walking";
    from: string;
    to: string;
    departureTime?: string;
    arrivalTime?: string;
    cost?: number;
    duration?: number;
    details?: string;
}

export interface Accommodation {
    name: string;
    type: "hotel" | "hostel" | "apartment" | "bnb" | "other";
    location: string;
    checkIn: string;
    checkOut: string;
    cost?: number;
    rating?: number;
}

export interface PlanTodo {
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed";
    priority?: "low" | "medium" | "high";
    category?: "transportation" | "accommodation" | "activity" | "research" | "booking" | "other";
    estimatedTime?: number; // minutes
    deadline?: string;
    dependencies?: string[]; // array of todo IDs this depends on
    assignedTo?: string; // which specialist/agent should handle this
}
