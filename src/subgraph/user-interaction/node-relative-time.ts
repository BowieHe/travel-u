import { DeepSeek } from "@/models/deepseek";
import { AgentState } from "@/types/type";
import { SystemMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";

export const createTimeDecodeNode = (tools: DynamicStructuredTool[]) => {
	const llm = new DeepSeek();
	const model = llm.llm("deepseek-chat").bindTools(tools);

	const prompt = `从以下用户输入中识别所有相对时间表达式（例如 '下周', '明天', '下个月'）。如果有上述的表达方式, 请调用 ‘time_’ 工具来对时间进行解析。`;

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		try {
			// todo)) assume the last message is the user input
			const userInput = state.messages[state.messages.length - 1];

			const response = await model.invoke([
				new SystemMessage({ content: prompt }),
				userInput,
			]);

			if (response.tool_calls && response.tool_calls.length > 0) {
				const toolCall = response.tool_calls[0];
				const tool = tools.find((t) => t.name === toolCall.name);
				if (!tool) {
					console.error(`Tool ${toolCall.name} not found`);
					return {
						messages: [response],
						errorMessage: `Tool ${toolCall.name} not found`,
					};
				}
				const toolResult = await tool.func(toolCall.args);
				const toolMessage = new ToolMessage({
					tool_call_id: toolCall.id ?? "",
					content: toolResult,
				});
				return {
					messages: [toolMessage],
					next: "process_response", // 继续处理用户回复
				};
			}
			// Always return a Partial<AgentState> if no tool calls are found
			return {
				messages: state.messages,
				next: "process_response",
			};
		} catch (error) {
			console.error("时间表达式提取失败:", error);
			return {
				errorMessage: `时间表达式提取失败`,
				user_interaction_complete: false,
			};
		}
	};
};
