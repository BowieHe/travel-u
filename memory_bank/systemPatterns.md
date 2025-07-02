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
