import { Gemini } from "@/models/gemini";
import { AgentState, TripPlanSchema } from "@/types/type";
import { TripPlan, mergeTripPlan } from "@/tools/trip-plan";
import { AIMessage, SystemMessage } from "@langchain/core/messages";

export async function extractAndUpdateTravelPlan(
    state: AgentState
): Promise<Partial<AgentState>> {
    console.log("---正在提取旅行计划信息 (TypeScript)---");

    // todo)) add feature to add info on user message
    // 修复：正确获取最后一条用户消息
    // const humanMessages = state.messages.filter(
    //     (msg) => msg.getType() === "human"
    // );
    // const userMessage = humanMessages[humanMessages.length - 1];

    // 简化：直接使用 state.tripPlan 或空对象
    const currentTravelPlan: TripPlan = state.tripPlan || {};

    const gemini = new Gemini();
    const llm = gemini.llm("gemini-2.5-flash-lite-preview-06-17");
    const structuredLlm = llm.withStructuredOutput(TripPlanSchema);

    const extractionPrompt = `你是一个善于从用户输入中提取旅行计划细节的助手。
    现在已知的信息如下:
    ${JSON.stringify(state.tripPlan)}
    请你根据用户的输入信息提取关键信息,结合原来的旅行计划信息进行更新。
    请严格按照下方 JSON schema 提取信息并输出为 JSON 对象。如果某项信息未提供，请省略该键或将其值设置为 null。除了 JSON 之外，不要包含任何其他文本。
    JSON schema:
    ${TripPlanSchema.toString()}`;

    try {
        const extractedInfo = await structuredLlm.invoke([
            new SystemMessage({ content: extractionPrompt }),
            ...state.messages,
        ]);

        // 使用工具函数合并 TripPlan
        const updatedTravelPlan = mergeTripPlan(
            currentTravelPlan,
            extractedInfo
        );

        console.log("提取并更新后的旅行计划:", updatedTravelPlan);
        return {
            tripPlan: updatedTravelPlan,
        };
    } catch (e) {
        console.error("信息提取或更新失败:", e);
        // 如果提取失败，可以返回原始 state 或添加错误消息
        return {
            tripPlan: currentTravelPlan,
            messages: [
                ...state.messages,
                new AIMessage({
                    content:
                        "抱歉，我未能完全理解您的旅行计划信息，请您再详细说明一下。",
                }),
            ],
        };
    }
}
