# 项目上下文 (TypeScript & LangGraph)

本项目是一个基于 TypeScript 和 LangGraph 构建的、支持分层代理交互的智能系统。

## 核心目标

-   **构建高级 MCP 客户端**: 利用 LangGraph 的图状结构，设计并实现一个健壮、可扩展的 MCP (Model Communication Protocol) 客户端系统。
-   **实现动态工具调用**: 建立一个能够动态发现并调用外部 MCP 服务器工具的框架，使智能体能无缝利用外部能力。
-   **支持交互式会话**: 允许用户通过命令行与系统进行动态问答，实现流畅的人机交互。

## 关键特性

-   **分层代理交互 (Hierarchical Agent Interaction)**: 系统采用编排器 (Orchestrator) 与专家 (Specialist) 的分层结构。编排器负责解析用户意图并将其分解为子任务，随后委派给相应的专家 Agent 执行。
-   **专家 Agent 子循环 (Specialist Agent Sub-loops)**: 每个专家 Agent 内部封装了一个独立的 LangGraph 图（子循环）。这使其能够自主地执行多步推理和工具调用，以解决复杂的子问题，完成后再将结果返回给编排器。
-   **动态工具生成**: 系统在启动时自动从 MCP 服务器获取可用工具列表，并为每个工具动态创建对应的 `LangGraph` 工具实例，实现了真正的运行时工具绑定。
-   **弹性连接管理**: 设有集中的 MCP 客户端管理器，负责维护与多个 MCP 服务器（支持 SSE 和 Stdio）的稳定连接，并具备自动重连等弹性机制。
-   **架构解耦**: `LangGraph` 中的智能体逻辑与底层的 MCP 通信协议完全分离。智能体仅需关注“调用工具”，无需关心其来源或实现细节。

## 依赖管理

-   本项目使用 npm (Node Package Manager) 进行依赖管理。
-   核心依赖项定义在 `package.json` 文件中。
-   请使用 `npm install` 命令来安装或更新依赖。
