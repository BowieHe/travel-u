import {
	TripPlan,
	isTripPlanComplete,
	convertTripPlanToMemory,
	getMissingField,
} from "../../tools/trip-plan";
import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { graphState } from "../../types/state";
import { AgentState } from "../../types/type";
import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createTimeDecodeNode } from "./node-relative-time";
import { createUserResponse } from "./user-response";

const startRouter = (state: AgentState): "process_response" | "ask_user" => {
	const lastMessage = state.messages[state.messages.length - 1];

	// 如果最后一条消息是用户消息，直接处理
	if (lastMessage && lastMessage.getType() === "human") {
		console.log("检测到用户消息，开始处理");
		return "process_response";
	}

	// 如果最后一条消息是AI消息，询问用户
	if (lastMessage && lastMessage.getType() === "ai") {
		console.log("需要用户输入");
		return "ask_user";
	}

	// 默认询问用户
	console.log("开始用户交互");
	return "ask_user";
};

// 生成询问用户的消息
function generateQuestionForUser(missingRequiredFields: string[]): string {
	let followUpMessage = "";
	if (
		missingRequiredFields.includes("destination") &&
		missingRequiredFields.includes("departure") &&
		missingRequiredFields.includes("startDate")
	) {
		followUpMessage =
			"请告诉我您想去哪里、从哪里出发，以及大概什么时候出发？";
	} else if (
		missingRequiredFields.includes("destination") &&
		missingRequiredFields.includes("departure")
	) {
		followUpMessage = "请告诉我您想去哪里，以及从哪里出发？";
	} else if (
		missingRequiredFields.includes("destination") &&
		missingRequiredFields.includes("startDate")
	) {
		followUpMessage = "您的目的地是哪里，大概什么时候出发？";
	} else if (
		missingRequiredFields.includes("departure") &&
		missingRequiredFields.includes("startDate")
	) {
		followUpMessage = "您从哪里出发，大概什么时候出发？";
	} else if (missingRequiredFields.includes("destination")) {
		followUpMessage = "您的目的地是哪里？";
	} else if (missingRequiredFields.includes("departure")) {
		followUpMessage = "您从哪里出发？";
	} else if (missingRequiredFields.includes("startDate")) {
		followUpMessage = "大概什么时候出发？";
	} else {
		// 针对其他（较少见）的必填字段组合，列出缺失项
		const fieldToChineseMap: Record<string, string> = {
			destination: "目的地",
			departure: "出发城市",
			startDate: "出发日期",
			endDate: "结束日期",
			budget: "预算",
			transportation: "交通方式",
		};
		const chineseMissing = missingRequiredFields.map(
			(field) => fieldToChineseMap[field]
		);
		followUpMessage = `我们还需要知道以下信息：${chineseMissing.join(
			"、"
		)}。`;
	}
	return followUpMessage;
}

// 询问用户节点
const askUserNode = async (state: AgentState): Promise<Partial<AgentState>> => {
	console.log("--- 询问用户节点 ---");
	const currentTripPlan = state.tripPlan;

	// 检查最后一条消息是否已经是问题
	const lastMessage = state.messages[state.messages.length - 1];
	if (lastMessage && lastMessage.getType() === "ai") {
		console.log("--- 最后一条消息已经是问题，跳过重复提问 ---");
		return {};
	}

	// 生成问题 - 使用 getMissingField 获取缺失字段
	let missingFields: string[] = new Array<string>();
	if (lastMessage && lastMessage.getType() === "tool") {
		missingFields =
			JSON.parse(lastMessage.content.toString()).missing_fields || [];
	}
	// 如果没有获取到缺失字段，使用 getMissingField 函数
	if (!missingFields.length) {
		missingFields = getMissingField(currentTripPlan || {});
	}
	const question = generateQuestionForUser(missingFields);
	console.log("生成问题:", question);

	// 将AI的问题添加到现有messages中
	return {
		messages: [
			// ...state.messages,
			new AIMessage({ content: question }),
		],
	};
};

// 等待用户输入节点
const waitForUserNode = async (
	state: AgentState
): Promise<Partial<AgentState>> => {
	console.log("--- 等待用户输入节点 ---");

	// 使用 interrupt 暂停执行，等待人类输入
	// 这里的 interrupt 会暂停图的执行
	const userInput = interrupt("user_input_needed");

	console.log("收到用户输入:", userInput);

	// 将用户输入添加到消息历史中
	return {
		messages: [
			// ...state.messages,
			new HumanMessage({ content: userInput as string }),
		],
	};
};

// // 处理用户回复并提取信息节点
// const processUserResponseNode = async (
// 	state: AgentState
// ): Promise<Partial<AgentState>> => {
// 	console.log("--- 处理用户回复 ---");

// 	try {
// 		// 使用 extractAndUpdateTravelPlan 来提取和更新信息
// 		const result = await extractAndUpdateTravelPlan(state);

// 		// 检查是否获得了所有必需信息
// 		const updatedTripPlan = result.tripPlan;
// 		const isComplete = updatedTripPlan
// 			? isTripPlanComplete(updatedTripPlan)
// 			: false;

// 		console.log("提取结果:", {
// 			tripPlan: updatedTripPlan,
// 			isComplete: isComplete,
// 		});

// 		return {
// 			...result,
// 			user_interaction_complete: isComplete,
// 		};
// 	} catch (error: any) {
// 		console.error("处理用户回复时出错:", error);
// 		return {
// 			errorMessage: `处理用户回复失败: ${error.message}`,
// 			user_interaction_complete: false,
// 		};
// 	}
// };

// 路由器：决定是继续询问还是结束
const userInteractionRouter = (
	state: AgentState
): "ask_user" | "complete_interaction" => {
	if (state.user_interaction_complete) {
		console.log("用户交互完成，所有必需信息已收集");
		return "complete_interaction";
	} else {
		console.log("信息不完整，继续询问用户");
		return "ask_user";
	}
};

// 新增：将 tripPlan 信息转换为 memory 格式的函数
// 移除本地定义，使用从 @/tools/trip-plan 导入的函数

// 完成节点：将收集到的信息传回主图
const completeInteractionNode = async (
	state: AgentState
): Promise<Partial<AgentState>> => {
	console.log("--- 完成用户交互 ---");
	// const tripPlan = state.tripPlan || {};
	// const memory = convertTripPlanToMemory(tripPlan);

	// console.log("子图收集到的信息，转换为 memory:", memory);

	// return {
	// 	memory: { ...state.memory, ...memory },
	// 	user_interaction_complete: true,
	// };
	return {};
};

export function createUserInteractionSubgraph(tools: DynamicStructuredTool[]) {
	const relativeTimeNode = createTimeDecodeNode(tools);
	const userResponseNode = createUserResponse();

	const subgraph = new StateGraph<AgentState>({
		channels: graphState,
	})
		.addNode("ask_user", askUserNode)
		.addNode("wait_for_user", waitForUserNode)
		.addNode("relative_time", relativeTimeNode)
		.addNode("process_response", userResponseNode)
		.addNode("complete_interaction", completeInteractionNode)

		// 开始路由：根据消息类型决定流向
		.addConditionalEdges(START, startRouter, {
			ask_user: "ask_user",
			process_response: "relative_time", // 如果有用户消息，直接跳到时间处理
		})

		// 询问用户 -> 等待输入
		.addEdge("ask_user", "wait_for_user")

		// 等待输入 -> 时间处理
		.addEdge("wait_for_user", "relative_time")

		// 时间处理 -> 响应处理
		.addEdge("relative_time", "process_response")

		// 条件边：根据信息完整性决定是继续询问还是完成交互
		.addConditionalEdges("process_response", userInteractionRouter, {
			ask_user: "ask_user",
			complete_interaction: "complete_interaction",
		})

		// 完成交互后结束子图
		.addEdge("complete_interaction", END);

	return subgraph.compile();
}
