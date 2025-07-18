import { TripPlan } from "@/types/type";
import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { graphState } from "@/types/state";
import { AgentState } from "@/types/type";
import { extractAndUpdateTravelPlan } from "@/nodes/user-interact/extract";
import { AIMessage } from "@langchain/core/messages";

// 检查旅行计划是否完整的函数
function checkTripPlanComplete(tripPlan: TripPlan): boolean {
	// 检查必需字段是否都已填写
	const requiredFields = ["destination", "departure", "startDate"];
	return requiredFields.every(
		(field) =>
			tripPlan[field as keyof TripPlan] &&
			tripPlan[field as keyof TripPlan] !== null &&
			tripPlan[field as keyof TripPlan] !== undefined
	);
}

// 生成询问用户的消息
function generateQuestionForUser(tripPlan: TripPlan): string {
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
	console.log("--- 询问用户节点 ---");
	const currentTripPlan = state.tripPlan || {};
	const question = generateQuestionForUser(currentTripPlan);

	const aiMessage = new AIMessage({ content: question });

	return {
		messages: [...state.messages, aiMessage],
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
	const updatedTripPlan = result.tripPlan || state.tripPlan || {};
	const isComplete = checkTripPlanComplete(updatedTripPlan);

	return {
		...result,
		user_interaction_complete: isComplete,
	};
};

// 路由器：决定是继续询问还是结束
const userInteractionRouter = (state: AgentState): "ask_user" | "END" => {
	if (state.user_interaction_complete) {
		console.log("用户交互完成，所有必需信息已收集");
		return "END";
	} else {
		console.log("信息不完整，继续询问用户");
		return "ask_user";
	}
};

export function createUserInteractionSubgraph() {
	const subgraph = new StateGraph<AgentState>({
		channels: graphState,
	})
		.addNode("ask_user", askUserNode)
		.addNode("wait_for_user", waitForUserNode)
		.addNode("process_response", processUserResponseNode)

		// 设置边
		.addEdge(START, "ask_user")
		.addEdge("ask_user", "wait_for_user")
		.addEdge("wait_for_user", "process_response")

		// 条件边：根据信息完整性决定是继续询问还是结束
		.addConditionalEdges("process_response", userInteractionRouter, {
			ask_user: "ask_user",
			END: END,
		});

	return subgraph.compile();
}
