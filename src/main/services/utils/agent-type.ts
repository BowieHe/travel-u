import { BaseMessage } from '@langchain/core/messages';
import { AnyExpertTask, TaskType } from '../utils/task-type';
import { TripInfo } from '../tools/trip-plan';
import { z } from 'zod';

export type AgentNode =
    | 'tools'
    | 'router'
    | 'planner'
    | 'direct_answer'
    | 'agent_router'
    | 'ask_user'
    | 'trip_plan_summary';

export type UserInteractionNode =
    | 'complete_interaction'
    | 'process_response'
    | 'wait_user'
    | 'ask_user';

type Outcome = 'success' | 'reprompt' | 'cancel';

export type SpecialistNode =
    | 'transportation_specialist'
    | 'destination_specialist'
    | 'food_specialist';


export interface AgentState {
    messages: Array<BaseMessage>;
    next: AgentNode | 'END' | TaskType  | UserInteractionNode;

    tripInfo?: TripInfo;
    currentTaskIndex: number;

    currentSpecialist?: SpecialistNode | 'END';

    errorMessage?: string;

    // 计划/任务列表
    planTodos?: PlanTodo;

    // 通用记忆容器（路由、中间数据等）
    memory?: Record<string, any>;

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

// export interface PlanTodo {
//     // id: string;
//     description: string;
//     status: 'pending' | 'in_progress' | 'completed';
//     priority?: 'low' | 'medium' | 'high';
//     category?: 'transportation' | 'accommodation' | 'activity' | 'research' | 'booking' | 'other';
//     // estimatedTime?: number; // minutes
//     // deadline?: string;
//     // dependencies?: string[]; // array of todo IDs this depends on
//     // assignedTo?: string; // which specialist/agent should handle this
// }

const TaskSchema = z.object({
    description: z.string().describe('具体的任务描述，以动词开头'),
    status: z.enum(['pending', 'in_progress', 'completed']).describe("当前的任务状态，默认初始的都是`pending`"),
    category: z
        .enum(['research', 'booking', 'transportation', 'accommodation', 'activity', 'other'])
        .describe('任务分类'),
    priority: z.enum(['high', 'medium', 'low']).describe('任务优先级'),
});

// 直接返回任务数组，不包装在 tasks 字段中
export const PlanSchema = z.array(TaskSchema).describe('任务列表数组，至少包含1个任务');

export type PlanTodo = z.infer<typeof PlanSchema>;