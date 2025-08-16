# Node.js 调试指南

## 🚀 调试方式

### 1. Electron 主进程调试
使用 VSCode 调试面板中的配置：

- **Debug Electron Main Process** - 调试构建后的主进程
- **Debug Electron Dev (with auto-reload)** - 开发模式调试
- **Debug Electron Main with Inspect** - 使用 inspect 模式调试

### 2. 独立 Node.js 代码调试

#### 2.1 通过 VSCode 调试面板
- **Debug Node.js - LangGraph Service** - 专门调试 LangGraph 服务
- **Debug Node.js - Test Script** - 调试当前打开的 TypeScript 文件
- **Attach to Electron Main** - 附加到运行中的进程

#### 2.2 通过命令行
```bash
# 测试 LangGraph 服务
yarn debug:langgraph

# 运行特定的 Node.js 脚本
yarn debug:node <script-path>

# 例如：调试特定的代理文件
yarn debug:node src/main/services/agents/direct-answer.ts
```

### 3. 设置断点
1. 在你想调试的 TypeScript 文件中设置断点
2. 选择合适的调试配置
3. 按 `F5` 开始调试

### 4. 调试特定模块

#### 调试 LangGraph 服务
```bash
# 运行测试脚本
yarn debug:langgraph
```

#### 调试 AI 代理
1. 打开 `src/main/services/agents/` 中的任何文件
2. 使用 "Debug Node.js - Test Script" 配置
3. 设置断点并开始调试

#### 调试工作流
1. 打开 `src/main/services/workflows/` 中的任何文件
2. 使用相同的调试配置

## 🛠️ 环境变量
所有调试配置都会自动加载 `.env` 文件中的环境变量。

## 📝 日志
在调试过程中，所有 console.log 输出都会显示在 VSCode 的集成终端中。

## 🔧 故障排除

### 无法启动调试
1. 确保已安装所有依赖：`yarn install`
2. 确保 TypeScript 配置正确
3. 检查 `.env` 文件是否存在必要的环境变量

### 断点不触发
1. 确保 sourceMaps 启用
2. 尝试重新构建项目：`yarn build`
3. 检查文件路径是否正确