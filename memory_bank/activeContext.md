# 活动上下文

## 2025-07-07: 修复 ParserAgent 逻辑并增强图日志

**目标**: 解决 `ParserAgent` 在多轮调用中因 `ToolMessage` 导致的错误，并为图节点添加清晰的执行日志以便调试。

### 任务一：修复 `ParserAgent` 上下文逻辑

-   **问题**: `ParserAgent` 错误地假定消息历史中的最后一条消息永远是 `HumanMessage`，这在工具调用后不成立。
-   **修复思路**: 修改 `ParserAgent` 的 `RunnableLambda`，使其不再简单地取最后一条消息。新的逻辑从消息数组的末尾向前搜索，找到第一个 `HumanMessage` 实例，并使用其内容。这确保了即使在 `ToolMessage` 之后，也能正确捕获到用户的原始输入。
-   **关键代码修改 (`src/agents/parser.ts`)**:

    ```typescript
    // Find the latest HumanMessage by searching backwards.
    const humanMessage = [...state.messages]
        .reverse()
        .find((msg): msg is HumanMessage => msg instanceof HumanMessage);

    if (!humanMessage) {
        throw new Error("No HumanMessage found in the state.");
    }
    const userInput = humanMessage.content;
    ```

### 任务二：为图节点添加执行日志

-   **问题**: 调试时难以区分当前正在执行的图节点。
-   **修复思路**: 在 `initializeGraph` 函数中，为每个关键节点 (`orchestrator`, `parser`, `tool_node`) 的执行逻辑前添加一个 `console.log` 语句。为了给 `orchestrator` 和 `tool_node` 添加日志，它们被包装在一个新的 `async` 函数中。
-   **关键代码修改 (`src/graph.ts`)**:

    ```typescript
    // Orchestrator Node with Logging
    const orchestratorAgent = createOrchestrator(mcpTools);
    const orchestrator = async (state: AgentState) => {
        console.log("\n--- EXECUTING ORCHESTRATOR ---");
        return orchestratorAgent.invoke(state);
    };

    // ToolNode with Logging
    .addNode("tool_node", async (state: AgentState) => {
        console.log("\n--- EXECUTING TOOL_NODE ---");
        return toolNode.invoke(state);
    })

    // Parser Node with Logging
    .addNode("parser", async (state: AgentState) => {
        console.log("\n--- EXECUTING PARSER ---");
        // ... rest of the parser logic
    });
    ```
