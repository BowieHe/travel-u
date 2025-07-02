# Project Progress Log

## 2025-06-25 14:40:00

**Task:** Fix critical issues with LLM streaming tool calls and subsequent API errors.

**Completed By:** User & NexusCore

**Role:** `code-developer` & `nexuscore`

**Status:** **Success**

**Time Spent:** Approximately 4 hours (cumulative over multiple sessions).

### Summary

Successfully resolved a complex, multi-stage bug involving LLM streaming, tool call parsing, and error handling. The initial problem manifested as garbled console output and an `insufficient tool messages` API 400 error. The debugging journey revealed and fixed several underlying issues, culminating in a robust and stable implementation.

### Key Problems and Resolutions

1.  **Problem: Garbled Stream & Multiple Tool Call Aggregation**

    -   **Symptom:** The initial stream handler incorrectly processed a mix of plain text and multiple tool call JSON chunks, leading to concatenated arguments and parsing failures.
    -   **Resolution (`internal/llm/stream-handler.go`):** A new `OpenAIFunctionStreamHandler` was implemented. It now uses a `map[string]*llms.ToolCall` keyed by the tool call's unique ID to correctly aggregate arguments for multiple, concurrent tool calls. An ordered slice (`toolCallOrder`) preserves the execution sequence, and `lastToolCallID` tracks the most recent tool call for appending argument chunks. This design elegantly handles the complex, mixed-content stream.

2.  **Problem: Missing Tool Parameters & API 422 Errors**
    -   **Symptom:** The LLM frequently failed to provide required parameters (e.g., `fromStation`, `toStation`), causing the MCP tool to return a detailed JSON error. This complex error object was then sent back to the LLM, resulting in an API 422 (Unprocessable Entity) error.
    -   **Resolution (`internal/llm/tools.go`):**
        -   **Dynamic Tool Schema Generation:** The `MCPTools` function was enhanced with a `formatToolParameters` helper. This function dynamically inspects the `InputSchema` of each registered MCP tool and generates a detailed, human-readable description of its parameters (including type, description, and if it's required). This rich context is injected into the LLM's prompt, significantly improving its ability to provide the correct arguments.
        -   **Intelligent Error Formatting:** A new `formatMCPError` function was implemented. It intelligently parses various potential MCP error structures (e.g., field-specific validation errors, simple error messages) and formats them into a single, clean, plain-text string. This prevents the complex JSON from ever reaching the LLM, completely eliminating the 422 errors.

### Final State

The system is now stable. The stream handler correctly parses all tool calls, and the enhanced tool definitions and error handling prevent the common API errors previously encountered. The entire tool-calling pipeline is robust and well-documented in the code.

---

## 2025-07-01 16:28:00

**Task:** Analyze and resolve issues related to initial tool call errors and the lack of user interaction capabilities during AI execution.

**Status:** **Success**

### Sub-Task 1: Diagnose and Fix Initial Tool Call Error

-   **Completed By:** NexusCore (via `error-debugger` mode)
-   **Status:** **Success**
-   **Summary:** Successfully diagnosed and fixed a critical bug where tool calls without parameters would fail. The root cause was the system sending `null` as the arguments payload instead of an empty JSON object `{}`. A patch was applied to `internal/llm/tools.go` to initialize an empty map, ensuring the correct payload is always sent.

### Sub-Task 2: Design AI Interaction Interrupt Mechanism

-   **Completed By:** NexusCore (via `architect` mode)
-   **Status:** **Success**
-   **Summary:** Architected a new "Interactive Interrupt Loop" to solve the problem of the AI not waiting for user input. The design introduces a special tool, `ask_user_for_input`, which acts as a signal for the execution loop to pause and await user feedback. This crucial architectural decision has been documented in the `memory_bank/decisionLog.md`.

---

-   **任务名称**: 技术栈重构：迁移到 TypeScript & LangGraph
-   **描述**: 完成了从 Go 到 TypeScript 的基础项目迁移，并使用 `npm` 初始化了项目，安装了 `langchain` 和 `langgraph` 核心依赖。
-   **状态**: 成功
-   **完成者**: NexusCore (via code-developer)
-   **时间**: 2025-07-02
