import { AgentState } from "@/state";
import { extractAndParseJSON } from "@/utils/json-parser"; // 你的 JSON 解析

export const subtaskParserNode = async (
	state: AgentState
): Promise<Partial<AgentState>> => {
	const currentTaskIndex = state.currentTaskIndex + 1;
	const currentTask = state.subtask?.[currentTaskIndex];

	return {
		currentTaskIndex: currentTaskIndex,
		error_message: undefined,
	};
};
