# 架构决策日志 (精炼版)

本日志记录了项目从初期探索到当前 TypeScript + LangGraph 架构演进过程中的核心设计决策。

## 核心架构模式

| 决策日期   | 核心决策                               | 理由与价值                                                                                                                                                                                                                                      |
| ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-06-23 | **采纳“流式工具调用”模式**             | 为了追求极致的用户交互体验，通过实时反馈减少用户等待焦虑，实现类似“打字机”的输出效果。                                                                                                                                                          |
| 2025-07-01 | **设计“交互式中断循环”机制**           | 解决了 AI 在需要信息时无法暂停等待用户输入的痛点，通过 `ask_user_for_input` 信令实现了真正的人机协作循环。                                                                                                                                      |
| 2025-07-04 | **实现“专家 Agent 交互式子循环”**      | 赋予专家 Agent 独立与用户进行多轮对话的能力，通过动态路由（节点自循环）增强了系统的模块化、自治性和处理复杂任务的能力。                                                                                                                         |
| 2025-07-07 | **引入“参数解析 Agent”实现职责分离**   | 在修复 `ToolNode` 崩溃问题的过程中，发现 `Orchestrator` 职责过重。决定引入专门的 Agent 负责将高层意图转换为精确的工具参数，从而解耦任务调度与参数解析，提升系统健壮性和可扩展性。                                                               |
| 2025-07-07 | **实现 `ParserAgent` 工厂函数**        | 采用灵活的工厂函数模式 (`createParserAgent`) 创建参数解析器。该模式利用 LCEL 将专用 Prompt、`gpt-4.1-mini` 模型和 JSON 解析逻辑串联起来，以 `Runnable` 的形式提供，易于在 LangGraph 中集成和重用。                                              |
| 2025-07-07 | **落地 `Orchestrator -> Parser` 流程** | 通过重构 `graph.ts`，正式确立了新的核心工作流。`Orchestrator` 仅负责决策（设置 `next_tool` 状态），然后将控制权交给 `Parser` 节点进行参数生成，最终由 `ToolNode` 执行。这个清晰的流程从根本上解决了之前的 bug，并极大地提升了系统的模块化水平。 |

---

## 关键实现与决策详情

### 架构决策 [专家 Agent 交互式子循环]

**日期:** 2025-07-04

**背景与问题:**
原有的图结构是一个严格的、由 `Orchestrator` 驱动的单向分发模型。专家 Agent 在被调用后，控制权会立即强制性地返回给 `Orchestrator`。这种设计使得专家 Agent 无法独立地与用户进行连续的多轮对话来澄清复杂任务，限制了系统的整体智能。

**解决方案:**
采纳“交互式子图”或“节点自循环”的架构模式。

1.  **动态条件边:** 移除了从专家节点到 `Orchestrator` 的无条件边，替换为依赖于 `AgentState` 中 `next` 字段的条件边。
2.  **动态路由逻辑:**
    -   **循环:** 若专家 Agent 判断任务未完成，则将 `next` 设为自身节点名，形成交互循环。
    -   **退出:** 若任务完成，则将 `next` 设为 `Orchestrator`，将控制权交还。
3.  **增强专家 Agent:** `Specialist` 基类 (`specialist.ts`) 被重构，使其能通过内部 LLM Chain 智能决策下一步路由，并更新 `next` 字段。

**收益:**

-   **真正的多轮对话:** 专家 Agent 能独立完成复杂子任务。
-   **增强的模块化:** 每个专家 Agent 成为能管理自身流程的自治单元。
-   **提升的灵活性:** 系统能处理更复杂的真实世界场景。

---

### 决策 [交互式中断循环机制]

**日期:** 2025-07-01

**理由:** 解决单向流式工具调用中，AI 无法暂停以等待用户输入的交互死循环问题。

**解决方案:**

1.  **定义信令:** 引入一个特殊的工具调用 `ask_user_for_input` 作为中断信令。
2.  **修改流程:** 客户端检测到此信令后，暂停执行，向用户提问并等待输入。
3.  **恢复循环:** 用户的回答将作为新消息加入对话历史，并重启 LLM 流程。

**影响:** 根本上实现了“人机协作”，但略微增加了客户端逻辑的复杂度。

---

## TypeScript 技术栈关键实现节点

-   **[2025-07-02] 基础结构搭建:**

    -   实现了分层代理系统的核心 TypeScript 代码结构 (`AgentState`, `RunnableAgent`, `Orchestrator`, `Specialist`)。
    -   实现了动态 MCP 客户端 (`mcp-client.ts`) 和工具生成器 (`mcp-tools.ts`)，并集成到 LangGraph。
    -   将应用改造为基于 Node.js `readline` 的交互式命令行界面。

-   **[2025-07-03] 交互体验优化:**

    -   在 `runGraph` 函数中实现了基于 `AIMessageChunk` 的“打字机”流式输出效果。
    -   成功启用 `deepseek-reasoner` 模型的思考过程流，通过在 `ChatOpenAI` 构造函数中设置顶层 `reasoning: {}` 参数解决。

-   **[2025-07-04] 健壮性增强:**

    -   在 Orchestrator 中引入 Zod，通过 `ToolCallSchema` 和 `AgentStateSchema` 对关键方法的输入、输出及工具调用参数进行严格验证，确保运行时数据一致性。

-   **[2025-07-07] 状态一致性与健壮性:**

    -   **决策:** 强制要求 Agent 在不调用工具时，必须在其返回的 `AIMessage` 状态中将 `tool_calls` 属性显式设置为空数组 (`[]`)。
    -   **理由:** 解决了下游 `ToolNode` 因尝试访问 `undefined.length` 而导致的 `TypeError`。此举确保了无论 Agent 是否调用工具，其输出的状态结构都是一致和可预测的，从而增强了整个 LangGraph 图的稳定性和容错能力。

---

**Decision:** Implement a graceful shutdown mechanism for MCP clients to fix process hanging on exit.

**Date:** 2025-07-09

**Rationale:**

-   The application would not terminate properly after typing "exit" because active MCP client connections were preventing the Node.js event loop from closing.
-   The fix involved creating a new `shutdown` method in the `McpClientManager` to explicitly disconnect all clients.
-   This `shutdown` method is now called from the main application loop in `src/index.ts` before the process is supposed to exit, ensuring all resources are released.

**Outcome:**

-   The application now exits cleanly and reliably.

---
