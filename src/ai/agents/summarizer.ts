import { DeepSeek } from "../models/deepseek";
import { AgentState } from "../types/agent";
import {
    SystemMessage,
    AIMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { TRAVEL_AGENT_PROMPT } from "../../lib/prompts/prompt";

export const createSummarizer = () => {
    const ds = new DeepSeek();
    const model = ds.llm("deepseek-chat");

    // 创建一个总结函数
    const summarize = async (state: AgentState) => {
        const messages = state.messages;

        // 过滤出所有专家的回答和工具调用结果
        const relevantMessages = messages.filter(
            (msg) =>
                msg instanceof AIMessage ||
                (msg instanceof ToolMessage && msg.content)
        );

        const systemPrompt = new SystemMessage(
            `你是一个旅行规划助手的总结员。你的任务是:
            1. 分析所有专家（交通专家和目的地专家）的建议和工具调用结果
            2. 将这些信息整理成一个连贯、易于理解的旅行计划
            3. 使用自然、友好的语言，重点突出：
               - 交通方案（包括时间、方式、价格等）
               - 目的地推荐（包括景点、美食等）
               - 实用的建议和提示
            4. 如果发现信息有冲突或不完整，要明确指出`
        );

        try {
            const result = await model.invoke([
                systemPrompt,
                ...relevantMessages,
            ]);

            return result;
        } catch (error) {
            console.error("总结生成失败:", error);
            return {
                content:
                    "抱歉，我在总结旅行计划时遇到了问题。请检查专家提供的建议是否完整。",
            };
        }
    };

    return {
        summarize,
    };
};
