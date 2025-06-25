package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/BowieHe/travel-u/internal/agents"
	"github.com/BowieHe/travel-u/internal/agents/transportation"
	"github.com/BowieHe/travel-u/pkg/model"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/memory"
)

// OrchestratorAgent 是我们系统的“大脑”。
// 它负责理解用户意图、委派任务给专家Agent，并总结最终结果。
type OrchestratorAgent struct {
	llm llms.Model
}

// New 创建一个新的 OrchestratorAgent 实例。
func New() (*OrchestratorAgent, error) {
	llm, err := model.GetOpenAI(types.LLMOption{
		Model: "gpt-4o",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get LLM for OrchestratorAgent: %w", err)
	}
	return &OrchestratorAgent{llm: llm}, nil
}

// Execute 是 OrchestratorAgent 的主入口，实现了 agents.Agent 接口。
// 这是整个对话流程的起点。
func (a *OrchestratorAgent) Execute(ctx context.Context, initialQuery string, history *memory.ConversationBuffer) (summary string, err error) {
	// 1. 定义委派工具
	delegateTool := llms.Tool{
		Type: "function",
		Function: &llms.FunctionDefinition{
			Name:        "delegate_to_transportation_agent",
			Description: "当用户意图明显是关于交通、出行、票务（机票、火车票、船票等）相关时，将任务委派给交通专家。",
			Parameters: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"task_description": map[string]any{
						"type":        "string",
						"description": "根据对话历史和用户最新问题，生成一个清晰、完整、对交通专家友好的任务描述。",
					},
				},
				"required": []string{"task_description"},
			},
		},
	}

	// 2. 构建Prompt
	messages := []llms.MessageContent{
		{
			Role: llms.ChatMessageTypeSystem,
			Parts: []llms.ContentPart{
				llms.TextContent{Text: "你是一个智能旅行助手的大脑，你的主要职责是理解用户的意图，并将任务精确地委派给合适的专家Agent。请根据用户的输入和我们提供的工具，判断是否需要委派任务。"},
			},
		},
		{
			Role: llms.ChatMessageTypeHuman,
			Parts: []llms.ContentPart{
				llms.TextContent{Text: initialQuery},
			},
		},
	}

	// 3. 调用LLM进行决策
	response, err := a.llm.GenerateContent(ctx, messages, llms.WithTools([]llms.Tool{delegateTool}))
	if err != nil {
		return "", fmt.Errorf("orchestrator LLM call failed: %w", err)
	}

	if len(response.Choices) == 0 {
		return "对不起，我暂时无法理解您的请求。", nil
	}

	choice := response.Choices[0]

	// 4. 检查是否需要调用工具
	if len(choice.ToolCalls) > 0 {
		toolCall := choice.ToolCalls[0]
		if toolCall.FunctionCall.Name == "delegate_to_transportation_agent" {
			// 5. 解析参数并委派任务
			var args struct {
				TaskDescription string `json:"task_description"`
			}
			if err := json.Unmarshal([]byte(toolCall.FunctionCall.Arguments), &args); err != nil {
				return "", fmt.Errorf("failed to unmarshal tool arguments: %w", err)
			}

			fmt.Println("[Orchestrator] 正在委派任务给 TransportationAgent...")
			fmt.Printf("[Orchestrator] 任务描述: %s\n", args.TaskDescription)

			// 实例化并执行专家
			transportAgent, err := transportation.New()
			if err != nil {
				return "", fmt.Errorf("failed to create transportation agent: %w", err)
			}
			return transportAgent.Execute(ctx, args.TaskDescription, history)
		}
	}

	// 6. 如果LLM不调用工具，则直接返回其思考结果
	return choice.Content, nil
}

// 确保 OrchestratorAgent 实现了 agents.Agent 接口。
var _ agents.Agent = (*OrchestratorAgent)(nil)
