// userInteractionSubgraph.ts
import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { AIMessage, SystemMessage } from "@langchain/core/messages";
import { UserInteractionState, graphState } from "@/subgraph/user-query/state";
import { Gemini } from "@/models/gemini";

// 节点1: 向用户提出问题
const askUserNode = async (
	state: UserInteractionState
): Promise<Partial<UserInteractionState>> => {
	console.log("--- Subgraph: Asking user question ---");
	const question =
		state.question_from_orchestrator || "我需要您的输入才能继续。";
	const aiMessage = new AIMessage(question);

	return {
		messages: [...state.messages, aiMessage],
		user_response: undefined,
		interaction_outcome: undefined,
	};
};

// 节点2: 中断等待用户输入
const waitForUserNode = async (
	state: UserInteractionState
): Promise<Partial<UserInteractionState>> => {
	console.log("--- Subgraph: Waiting for user input ---");
	return interrupt(state);
};

// 节点3: LLM 判断用户回复是否满足要求
const validateUserResponseNode = async (
	state: UserInteractionState
): Promise<Partial<UserInteractionState>> => {
	console.log("--- Subgraph: Validating user response ---");
	const lastMessage = state.messages[state.messages.length - 1];
	const userResponse = lastMessage.content.toString();

	const llm = new Gemini();
	const model = llm.llm("gemini-2.5-flash");

	const systemPrompt = `
你是一个用户回复验证助手。你需要分析用户的回复是否提供了所需的信息。

原始问题：${state.question_from_orchestrator}
用户回复：${userResponse}

请分析用户回复并判断：
1. 用户是否提供了有效的信息来回答问题？
2. 如果有效，请提取关键信息（出发地、目的地、日期等）
3. 如果无效，请说明需要用户澄清什么

请按以下格式回复：
VALID: true/false
EXTRACTED_INFO: 如果有效，提取的信息（格式：field_name=value）
REASON: 判断原因
FOLLOW_UP: 如果需要，下一步应该问什么问题
`;

	const systemMessage = new SystemMessage({ content: systemPrompt });
	const result = await model.invoke([systemMessage]);
	const validationResult = result.content.toString();

	console.log("Validation result:", validationResult);

	// 解析 LLM 的回复
	const isValid = validationResult.includes("VALID: true");

	if (isValid) {
		// 提取信息
		const extractedMatch = validationResult.match(/EXTRACTED_INFO: (.+)/);
		let extractedInfo = undefined;

		if (extractedMatch) {
			const extracted = extractedMatch[1].trim();
			if (extracted.includes("=")) {
				const [field_name, value] = extracted.split("=");
				extractedInfo = {
					field_name: field_name.trim(),
					value: value.trim(),
				};
			}
		}

		return {
			messages: [
				...state.messages,
				new AIMessage("好的，我已收到您的信息。"),
			],
			user_response: userResponse,
			interaction_outcome: "success",
			extracted_info: extractedInfo,
		};
	} else {
		// 需要重新询问
		const followUpMatch = validationResult.match(/FOLLOW_UP: (.+)/);
		const followUpQuestion = followUpMatch
			? followUpMatch[1].trim()
			: "请提供更详细的信息。";

		return {
			messages: [...state.messages, new AIMessage(followUpQuestion)],
			user_response: userResponse,
			interaction_outcome: "reprompt",
			question_from_orchestrator: followUpQuestion, // 更新问题
		};
	}
};

// 路由器：决定是重新提问还是退出
const subgraphRouter = (state: UserInteractionState): string => {
	if (state.interaction_outcome === "reprompt") {
		return "wait_for_user"; // 重新询问
	} else if (state.interaction_outcome === "success") {
		return "success_exit"; // 成功退出
	}
	return "cancel_exit"; // 取消退出
};

// 创建并返回已编译的子图
export function createUserInteractionSubgraph() {
	const subgraph = new StateGraph<UserInteractionState>({
		channels: graphState,
	})
		.addNode("ask_user", askUserNode)
		.addNode("wait_for_user", waitForUserNode)
		.addNode("validate_response", validateUserResponseNode)

		.addEdge(START, "ask_user")
		.addEdge("ask_user", "wait_for_user")
		.addEdge("wait_for_user", "validate_response")

		.addConditionalEdges("validate_response", subgraphRouter, {
			wait_for_user: "wait_for_user", // 重新询问
			success_exit: END, // 成功退出
			cancel_exit: END, // 取消退出
		});

	return subgraph.compile();
}
