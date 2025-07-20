/**
 * 简单测试改进的用户交互子图
 */

import { createUserInteractionSubgraph } from "@/subgraph/user-interaction/graph";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

export async function testImprovedSubgraph() {
    console.log("=== 测试改进的用户交互子图 ===");

    // 创建子图
    const subgraph = createUserInteractionSubgraph();

    // 配置
    const config = {
        configurable: {
            thread_id: "test-subgraph-001"
        }
    };

    // 初始状态
    const initialState = {
        messages: [
            new HumanMessage({ content: "我想规划一次旅行" })
        ],
        tripPlan: undefined,
        user_interaction_complete: false,
        memory: {},
        subtask: [],
        currentTaskIndex: 0,
        next: "ask_user" as any
    };

    try {
        console.log("\n--- 第一次运行子图 ---");
        const result1 = await subgraph.invoke(initialState, config);
        console.log("结果1:", result1);

        // 检查中断
        if (result1['__interrupt__']) {
            console.log("\n🔄 子图被中断，等待用户输入");
            console.log("中断信息:", result1['__interrupt__']);

            console.log("\n--- 恢复子图执行 ---");
            const result2 = await subgraph.invoke(
                new Command({ resume: "我想去北京" }),
                config
            );
            console.log("结果2:", result2);

            // 继续处理可能的更多中断
            if (result2['__interrupt__']) {
                console.log("\n🔄 再次中断");
                const result3 = await subgraph.invoke(
                    new Command({ resume: "从上海出发" }),
                    config
                );
                console.log("结果3:", result3);
            }
        }

    } catch (error) {
        console.error("测试出错:", error);
    }
}

// 运行测试
// testImprovedSubgraph().catch(console.error);
