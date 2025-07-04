# 系统模式

## 推荐目录结构

遵循标准的 Node.js/TypeScript 项目布局，有助于保持代码的组织性和可维护性。

-   `src/`: 存放项目所有的 TypeScript 源代码。
-   `dist/`: 存放由 TypeScript 编译器生成的 JavaScript 代码。
-   `node_modules/`: 存放项目的所有依赖。
-   `src/agents/`: 存放各类 Agent 的定义，包括 Orchestrator 和 Specialists。
-   `src/graph/`: 存放 LangGraph 的构建和配置代码。
-   `src/tools/`: (可选) 存放专家 Agent 使用的工具函数。
-   `package.json`: Node.js 项目的清单文件，包含依赖和脚本信息。
-   `tsconfig.json`: TypeScript 编译器的配置文件。

## 动态 MCP 工具集成模式

**目标**: 实现一个可扩展、高弹性的系统，允许`LangGraph`智能体动态地发现和调用在外部 MCP（Model-as-a-Service Communication Protocol）服务器上定义的工具。

**核心组件**:

1.  **`mcp-client-manager.ts`**:

    -   **职责**: 作为所有 MCP 客户端的中心管理器。
    -   **功能**:
        -   根据配置文件（如`mcp-servers.json`）自动连接到所有定义的 MCP 服务器（支持 SSE 和 Stdio）。
        -   管理客户端的生命周期，包括自动重连机制以保证弹性。
        -   提供一个简单的接口（如`getClient(serverName)`）供其他模块调用。

2.  **`mcp-tools.ts`**:

    -   **职责**: 动态生成`LangGraph`兼容的工具。
    -   **功能**:
        -   在程序启动时，通过`mcp-client-manager`向所有已连接的 MCP 服务器发送`listTools`请求。
        -   根据返回的工具定义，为每个外部工具动态地在内存中创建一个`LangGraph`的`Tool`实例。
        -   工具的名称、描述和输入模式（schema）完全由 MCP 服务器提供的信息决定。
        -   每个动态生成的工具内部都封装了通过`mcp-client-manager`调用相应`callTool`的逻辑。

3.  **`graph.ts` (集成点)**:
    -   **职责**: 将动态生成的工具集提供给`LangGraph`智能体。
    -   **功能**:
        -   在构建计算图（Graph）时，将`mcp-tools.ts`生成的所有工具注入到智能体可用的工具箱中。
        -   使得智能体能够基于用户输入，自主决策何时以及如何调用这些来自外部 MCP 服务器的工具。

**优势**:

-   **高度可扩展**: 新增或修改 MCP 服务器上的工具，无需改动核心应用代码。系统重启后即可自动集成。
-   **关注点分离**: `LangGraph`的业务逻辑与底层 MCP 通信细节完全解耦。
-   **继承与创新**: 完美复现了传统 Function Calling 的思想，并利用`LangGraph`的动态性将其提升到了新的高度。

## 分层代理与交互式子图模式 (Hierarchical Agents with Interactive Sub-Graphs)

**目标**: 解决复杂任务中总控 Agent (Orchestrator) 如何将特定子任务分派给专家 Agent (Specialists)，并允许这些专家 Agent 与用户进行独立、多轮的交互式对话以收集必要信息，最终将结果返回给总控中心。

**核心组件**:

1.  **Orchestrator Node**:

    -   **角色**: 任务分发中心。它接收初始用户请求，并根据任务性质决定将其路由到哪个 `Specialist Node`。

2.  **Specialist Nodes**:

    -   **角色**: 特定领域的专家。每个 `Specialist` 都被设计为处理一类特定任务（例如，机票预订、酒店查询）。它们拥有与该领域相关的工具和知识。

3.  **Conditional Edges**:
    -   **角色**: 实现动态路由的关键。图的边缘（Edges）基于 `Orchestrator` 的决策或 `Specialist` 的状态来决定下一个激活的节点。

**工作流程**:

1.  **任务路由**: 用户向 `Orchestrator` 发出请求。`Orchestrator` 分析请求，并通过工具调用（Tool Calling）的形式，将任务路由到一个合适的 `Specialist` 节点。这个路由决策本质上是选择一个代表特定专家的工具。

2.  **交互式对话**:

    -   `Specialist` 节点被激活后，如果发现完成任务所需的信息不完整（例如，预订机票但缺少目的地），它不会立即将控制权交还。
    -   通过一条**条件自循环边 (conditional self-looping edge)**，`Specialist` 会持续处理用户的后续输入。它会反复调用自身，直到从用户那里收集到所有必要信息。
    -   这个自循环的条件是 `next` 状态不等于 `"Orchestrator"`。

3.  **控制权交还**:
    -   一旦 `Specialist` 完成了其子任务（例如，成功预订了机票或确认了酒店），它会将状态中的 `next` 字段设置为 `"Orchestrator"`。
    -   图的条件边缘逻辑会捕捉到这个状态变化，并将控制权交还给 `Orchestrator` 节点。

**优势**:

-   **增强的模块化**: 每个 `Specialist` 都是一个独立的单元，易于开发、测试和维护。
-   **处理复杂交互**: 使系统能够处理需要多轮对话才能解决的复杂任务，而不是简单的一问一答。
-   **清晰的责任分离**: `Orchestrator` 专注于任务分发和宏观控制，而 `Specialist` 专注于其专业领域，符合单一职责原则。
-   **高度可扩展**: 可以轻松地向系统中添加新的 `Specialist` 来扩展新功能，而无需修改现有逻辑。
