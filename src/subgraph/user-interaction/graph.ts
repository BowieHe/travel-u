import {
	TripPlan,
	isTripPlanComplete,
	convertTripPlanToMemory,
} from "@/tools/trip-plan";
import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { graphState } from "@/types/state";
import { AgentState } from "@/types/type";
import { extractAndUpdateTravelPlan } from "@/nodes/user-interact/extract";
import { AIMessage } from "@langchain/core/messages";

const startRouter = (state: AgentState): "process_response" | "ask_user" => {
	if (state.messages[state.messages.length - 1].getType() === "ai") {
		console.log("User interaction not complete, asking user for input.");
		return "ask_user";
	} else {
		return "process_response";
	}
};
// 生成询问用户的消息
function generateQuestionForUser(tripPlan: TripPlan | undefined): string {
	if (!tripPlan) {
		return "请提供您的旅行计划信息。";
	}
	if (!tripPlan.destination) {
		return "请告诉我您的目的地是哪里？";
	}
	if (!tripPlan.departure) {
		return "请告诉我您的出发地是哪里？";
	}
	if (!tripPlan.startDate) {
		return "请告诉我您计划的出发日期是什么时候？";
	}
	if (!tripPlan.endDate) {
		return "请告诉我您计划的返回日期是什么时候？";
	}
	if (!tripPlan.budget) {
		return "请告诉我您的预算大概是多少？";
	}
	return "请提供更多旅行信息以便我为您制定更好的计划。";
}

// 询问用户节点
const askUserNode = async (state: AgentState): Promise<Partial<AgentState>> => {
	console.log("--- ask user ---");
	const currentTripPlan = state.tripPlan;

	// last message is already the question, skip
	if (state.messages[state.messages.length - 1].getType() === "ai") {
		console.log(
			"--- last message is already a question, skipping ask user node ---"
		);
		return {};
	}
	const question = generateQuestionForUser(currentTripPlan);

	return {
		messages: [new AIMessage({ content: question })],
	};
};

// 等待用户输入节点
const waitForUserNode = async (
	state: AgentState
): Promise<Partial<AgentState>> => {
	console.log("--- 等待用户输入 ---");
	return interrupt(state);
};

// 处理用户回复并提取信息节点
const processUserResponseNode = async (
	state: AgentState
): Promise<Partial<AgentState>> => {
	console.log("--- 处理用户回复 ---");
	// 使用 extractAndUpdateTravelPlan 来提取和更新信息
	const result = await extractAndUpdateTravelPlan(state);

	// 检查是否获得了所有必需信息
	const updatedTripPlan = result.tripPlan;

	// 使用工具函数检查完整性
	const isComplete = updatedTripPlan
		? isTripPlanComplete(updatedTripPlan)
		: false;

	return {
		...result,
		user_interaction_complete: isComplete,
	};
};

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
	const tripPlan = state.tripPlan || {};
	const memory = convertTripPlanToMemory(tripPlan);

	console.log("子图收集到的信息，转换为 memory:", memory);

	return {
		memory: { ...state.memory, ...memory },
		user_interaction_complete: true,
	};
};

export function createUserInteractionSubgraph() {
	const subgraph = new StateGraph<AgentState>({
		channels: graphState,
	})
		.addNode("ask_user", askUserNode)
		.addNode("wait_for_user", waitForUserNode)
		.addNode("process_response", processUserResponseNode)
		.addNode("complete_interaction", completeInteractionNode)

		.addConditionalEdges(START, startRouter, {
			process_response: "process_response",
			ask_user: "ask_user",
		})
		.addEdge("ask_user", "wait_for_user")
		.addEdge("wait_for_user", "process_response")

		// 条件边：根据信息完整性决定是继续询问还是完成交互
		.addConditionalEdges("process_response", userInteractionRouter, {
			ask_user: "ask_user",
			complete_interaction: "complete_interaction",
		})

		// 完成交互后结束子图
		.addEdge("complete_interaction", END);

	return subgraph.compile();
}
