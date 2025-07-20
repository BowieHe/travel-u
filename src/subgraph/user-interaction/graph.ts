import {
    TripPlan,
    isTripPlanComplete,
    convertTripPlanToMemory,
} from "@/tools/trip-plan";
import { StateGraph, START, END, interrupt } from "@langchain/langgraph";
import { graphState } from "@/types/state";
import { AgentState } from "@/types/type";
import { extractAndUpdateTravelPlan } from "@/nodes/user-interact/extract";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

/**
 * 用户交互子图 - 改进版
 * 
 * 关键改进：
 * 1. interrupt() 返回用户通过 Command({ resume: "用户输入" }) 提供的值
 * 2. 图的恢复点由 LangGraph 自动管理
 * 3. 恢复时从包含 interrupt() 的节点重新开始，但不会重复暂停
 * 
 * 使用方式：
 * ```typescript
 * // 第一次运行，会在 interrupt() 处暂停
 * const result1 = await graph.invoke(input, config);
 * 
 * // 检查是否有中断
 * if (result1['__interrupt__']) {
 *     // 恢复执行，提供用户输入
 *     const result2 = await graph.invoke(
 *         new Command({ resume: "用户的回复内容" }),
 *         config
 *     );
 * }
 * ```
 */

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

    // 检查最后一条消息是否已经是问题
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && lastMessage.getType() === "ai") {
        console.log("--- 最后一条消息已经是问题，跳过重复提问 ---");
        return {};
    }

    // 生成问题
    const question = generateQuestionForUser(currentTripPlan);
    console.log("生成问题:", question);

    return {
        messages: [new AIMessage({ content: question })],
    };
};

// 等待用户输入节点
const waitForUserNode = async (
    state: AgentState
): Promise<Partial<AgentState>> => {
    console.log("--- 等待用户输入 ---");

    // 关键修改：interrupt() 会返回用户通过 Command({ resume: "用户输入" }) 提供的值
    const userInput = interrupt({
        type: "user_input_request",
        question: state.messages[state.messages.length - 1]?.content || "请提供信息",
        currentTripPlan: state.tripPlan,
        context: "正在收集旅行计划信息"
    });

    console.log("收到用户输入:", userInput);

    // 将用户输入添加到消息历史中
    return {
        messages: [
            ...state.messages,
            new HumanMessage({ content: userInput })
        ]
    };
};

// 处理用户回复并提取信息节点
const processUserResponseNode = async (
    state: AgentState
): Promise<Partial<AgentState>> => {
    console.log("--- 处理用户回复 ---");

    try {
        // 使用 extractAndUpdateTravelPlan 来提取和更新信息
        const result = await extractAndUpdateTravelPlan(state);

        // 检查是否获得了所有必需信息
        const updatedTripPlan = result.tripPlan;
        const isComplete = updatedTripPlan ? isTripPlanComplete(updatedTripPlan) : false;

        console.log("提取结果:", {
            tripPlan: updatedTripPlan,
            isComplete: isComplete
        });

        return {
            ...result,
            user_interaction_complete: isComplete,
        };
    } catch (error: any) {
        console.error("处理用户回复时出错:", error);
        return {
            errorMessage: `处理用户回复失败: ${error.message}`,
            user_interaction_complete: false,
        };
    }
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
