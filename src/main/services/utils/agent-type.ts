import { BaseMessage } from '@langchain/core/messages';
import { AnyExpertTask, TaskType } from '../utils/task-type';

export type AgentNode =
    | 'orchestrator'
    | 'transportation_specialist'
    | 'destination_specialist'
    | 'subtask_parser'
    | 'summary'
    | 'tools'
    | 'router'
    | 'planner'
    | 'direct_answer'
    | 'agent_placeholder'
    | 'ask_user'
    | 'trip_plan_summary';

export type UserNode = 'ask_user' | 'process_response' | 'reletive_time';

type Outcome = 'success' | 'reprompt' | 'cancel';

export type SpecialistNode =
    | 'transportation_specialist'
    | 'destination_specialist'
    | 'food_specialist';

// LangGraph interrupt 相关类型定义
export interface InterruptInfo {
    interrupt_id: string;
    value: any;
    when?: string;
    resuming?: boolean;
}

export interface AgentState {
    messages: Array<BaseMessage>;
    next: AgentNode | 'END' | TaskType | UserNode;

    tripPlan?: TripPlan;
    // for subtasks
    subtask: Array<AnyExpertTask>;
    currentTaskIndex: number;

    currentSpecialist?: SpecialistNode | 'END';

    errorMessage?: string;

    // userInteractionState?: UserInteractionState;

    // 用户交互是否完成
    user_interaction_complete?: boolean;

    // 计划/任务列表
    planTodos?: PlanTodo[];

    // 通用记忆容器（路由、中间数据等）
    memory?: Record<string, any>;

    // === 用户交互收集缺失字段支持 ===
    // 当前仍缺失需要向用户询问的字段列表（来自路由的 missing_fields 或动态更新）
    interactionMissingFields?: string[];
    // 已经询问过的字段，避免重复提问
    interactionAskedFields?: string[];

    // 标记当前执行因需要用户输入而中断（interrupt）
    awaiting_user?: boolean;

    // === LangGraph 内部字段 ===
    // LangGraph interrupt 机制使用的字段
    interrupts?: InterruptInfo[];
    // LangGraph 元数据字段
    metadata?: Record<string, any>;
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
    destination?: string | null;
    // Added for alignment with trip-plan tool schema
    departure?: string | null; // 出发城市
    startDate?: string | null;
    endDate?: string | null;
    budget?: number | null;
    travelers?: number | null;
    preferences?: string[] | null;
    itinerary?: ItineraryItem[] | null;
    transportation?: string | null; // 用户明确的交通方式（不推断）
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
    type: 'sightseeing' | 'dining' | 'entertainment' | 'shopping' | 'transportation' | 'other';
}

export interface Transportation {
    type: 'flight' | 'train' | 'bus' | 'car' | 'taxi' | 'subway' | 'walking';
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
    type: 'hotel' | 'hostel' | 'apartment' | 'bnb' | 'other';
    location: string;
    checkIn: string;
    checkOut: string;
    cost?: number;
    rating?: number;
}

export interface PlanTodo {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
    priority?: 'low' | 'medium' | 'high';
    category?: 'transportation' | 'accommodation' | 'activity' | 'research' | 'booking' | 'other';
    estimatedTime?: number; // minutes
    deadline?: string;
    dependencies?: string[]; // array of todo IDs this depends on
    assignedTo?: string; // which specialist/agent should handle this
}
