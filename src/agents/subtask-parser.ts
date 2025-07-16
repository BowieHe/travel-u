import { AgentState } from "@/state";
import { extractAndParseJSON } from "@/utils/json-parser"; // 你的 JSON 解析工具
import { AnyExpertTask } from "@/utils/task-type";

// todo) add basic information into memory
export const subtaskParserNode = async (
    state: AgentState
): Promise<Partial<AgentState>> => {
    console.log("--- Executing Subtask Parser Node ---");
    // sub-task already parsed, continue and route to next subtask
    const subTasks = state.subtask;
    if (subTasks.length > 0 && state.currentTaskIndex < subTasks.length) {
        const nextIndex = state.currentTaskIndex + 1;
        if (nextIndex < subTasks.length) {
            return {
                currentTaskIndex: nextIndex,
                next: subTasks[nextIndex].task_type,
            };
        } else {
            // already iter all the tasks, return back to summary node
            return {
                currentTaskIndex: -1,
                next: "summary",
            };
        }
    }

    // parse the message into subTask lists
    const lastMessage = state.messages[state.messages.length - 1];

    try {
        const taskPromptJson = lastMessage.content.toString();
        const parsedTasks =
            extractAndParseJSON<AnyExpertTask[]>(taskPromptJson);

        if (!parsedTasks) {
            console.error("Invalid task prompt structure:", taskPromptJson);
            return {
                error_message: "Invalid task prompt structure received.",
            };
        }

        console.log(
            "Successfully parsed structured task:",
            JSON.stringify(parsedTasks, null, 2)
        );
        // 返回一个 Partial<AgentState> 来更新状态
        return {
            subtask: parsedTasks,
            currentTaskIndex: 0, // 初始化当前任务索引
            next: parsedTasks[0].task_type,
            error_message: undefined,
        };
    } catch (e: any) {
        console.error("Error parsing generate_task_prompt output:", e);
        return {
            error_message: `Failed to parse task prompt: ${e.message}`,
        };
    }
};
