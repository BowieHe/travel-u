import { initializeGraph } from "@/graph/graph";
import { Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";

/**
 * 演示如何使用改进的用户交互子图
 */
export async function demonstrateSubgraphUsage() {
    console.log("=== 初始化主图（包含改进的用户交互子图）===");
    const graph = await initializeGraph();

    // 配置线程 ID 用于状态持久化
    const config = {
        configurable: {
            thread_id: "user-interaction-demo-001"
        }
    };

    console.log("\n=== 第一次运行 - 用户发起对话 ===");
    const initialInput = {
        messages: [
            new HumanMessage({ content: "我想规划一次旅行" })
        ],
        user_interaction_complete: false
    };

    try {
        // 第一次运行 - 会在 interrupt() 处暂停
        console.log("开始执行图...");
        const result1 = await graph.invoke(initialInput, config);
        console.log("第一次执行结果:", result1);

        // 检查是否有中断
        if (result1['__interrupt__']) {
            console.log("\n🔄 检测到中断，等待用户输入");
            console.log("中断信息:", result1['__interrupt__']);

            // 模拟用户提供目的地信息
            console.log("\n=== 恢复执行 - 用户提供目的地 ===");
            const result2 = await graph.invoke(
                new Command({ resume: "我想去北京旅行" }),
                config
            );
            console.log("恢复后结果:", result2);

            // 可能还有更多中断，继续处理
            if (result2['__interrupt__']) {
                console.log("\n🔄 再次中断，继续收集信息");
                console.log("中断信息:", result2['__interrupt__']);

                console.log("\n=== 再次恢复 - 用户提供出发地 ===");
                const result3 = await graph.invoke(
                    new Command({ resume: "我从上海出发" }),
                    config
                );
                console.log("第三次结果:", result3);

                // 继续这个过程直到收集完所有信息
                if (result3['__interrupt__']) {
                    console.log("\n🔄 继续收集时间信息");
                    const result4 = await graph.invoke(
                        new Command({ resume: "我计划2025年8月1日出发，8月5日返回" }),
                        config
                    );
                    console.log("第四次结果:", result4);

                    if (result4['__interrupt__']) {
                        console.log("\n🔄 收集预算信息");
                        const result5 = await graph.invoke(
                            new Command({ resume: "预算大概5000元" }),
                            config
                        );
                        console.log("最终结果:", result5);
                    }
                }
            }
        }
    } catch (error) {
        console.error("执行过程中出错:", error);
    }
}

/**
 * 演示流式处理
 */
export async function demonstrateStreamingSubgraph() {
    console.log("\n\n=== 流式处理演示 ===");
    const graph = await initializeGraph();

    const config = {
        configurable: {
            thread_id: "streaming-demo-001"
        }
    };

    const initialInput = {
        messages: [
            new HumanMessage({ content: "帮我制定旅行计划" })
        ],
        user_interaction_complete: false
    };

    console.log("开始流式处理...");
    try {
        const stream = await graph.stream(initialInput, config);
        for await (const chunk of stream) {
            console.log("📦 流式输出:", Object.keys(chunk));

            // 检查每个节点的输出
            for (const [nodeKey, nodeValue] of Object.entries(chunk)) {
                if (nodeValue && typeof nodeValue === 'object' && '__interrupt__' in nodeValue) {
                    console.log(`🔄 节点 ${nodeKey} 产生了中断`);
                    console.log("中断详情:", nodeValue['__interrupt__']);
                    return; // 退出流处理，等待用户输入
                }
            }
        }
    } catch (error) {
        console.error("流式处理出错:", error);
    }
}

/**
 * 关键概念说明：
 *
 * 1. **恢复点管理**:
 *    - LangGraph 自动记录 interrupt() 的位置作为恢复点
 *    - 不需要手动指定恢复到哪个节点
 *
 * 2. **用户输入传递**:
 *    - interrupt() 函数的返回值 = Command({ resume: "用户输入" }) 中的 resume 值
 *    - 这是关键的数据传递机制
 *
 * 3. **重新执行机制**:
 *    - 恢复时从包含 interrupt() 的节点开始重新执行
 *    - 但这次 interrupt() 不会暂停，而是返回恢复值
 *
 * 4. **状态持久化**:
 *    - 使用 checkpointer 保存图的执行状态
 *    - thread_id 用于标识和恢复特定的对话会话
 *
 * 5. **子图独立性**:
 *    - 子图可以独立完成用户交互循环
 *    - 主图只需要处理子图的最终结果
 */

// 如果你想测试，可以运行：
// demonstrateSubgraphUsage().catch(console.error);
// demonstrateStreamingSubgraph().catch(console.error);
