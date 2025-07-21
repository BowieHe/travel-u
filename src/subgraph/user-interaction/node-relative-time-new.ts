import { DeepSeek } from "@/models/deepseek";
import { AgentState } from "@/types/type";
import { SystemMessage, ToolMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";

export const createTimeDecodeNode = (tools: DynamicStructuredTool[]) => {
	const llm = new DeepSeek();
	const model = llm.llm("deepseek-chat").bindTools(tools);

	const prompt = `你是一个时间语义解析专家。请严格按照以下规则处理用户输入中的相对时间表达：

1. 必须先调用 time_get_current_time 工具获取当前时间。
2. 根据用户的表达（如"明天"、"下周"、"下周末"、"下个月"等），结合当前时间进行语义推理和日期计算。
3. 典型转换规则：
   - "明天" = 当前日期 + 1天
   - "后天" = 当前日期 + 2天
   - "大后天" = 当前日期 + 3天
   - "下周" = 下周一的日期（即当前日期加到下一个周一）
   - "下周末" = 下周六的日期
   - "这周末" = 本周六的日期
   - "下个月" = 下个月同一天（如当前是7月21日，则为8月21日）
   - "一周后" = 当前日期 + 7天
   - "两周后" = 当前日期 + 14天
   - "一个月后" = 当前日期 + 30天
   - "两个月后" = 当前日期 + 60天
4. 如果表达为"下周一"、"下周五"等，请推算到对应的下周的具体日期。
5. 所有推理和计算都必须基于当前时间，不能仅仅依赖字符串匹配。
6. 计算完成后，调用时间工具返回最终的绝对日期（YYYY-MM-DD）。
7. 如果用户输入没有相对时间表达式，则无需调用时间工具。

请严格按照上述语义规则进行推理和工具调用，确保时间转换准确。`;

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
					name: toolCall.name, // 添加 name 字段，这是 Gemini 模型必需的
					content: toolResult,
				});
				return {
					messages: [...state.messages, response, toolMessage], // 保持完整的消息历史
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
