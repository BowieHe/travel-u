# 系统模式

记录项目中使用的重复模式和标准。

---

### 单例服务 (Singleton Services)

[2025-08-06] - 采用单例模式管理核心服务（如 `McpService`, `GraphService`），确保全局只有一个实例，简化状态管理和依赖注入。

---

### 统一应用上下文 (Unified Application Context)

[2025-08-06] - 引入一个统一的 `AppContext` 来集中管理应用级别的状态（如 `BrowserWindow`, `BrowserView`），替代分散的全局变量，提高状态的可预测性和可维护性。
