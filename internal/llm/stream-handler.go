package llm

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/tmc/langchaingo/llms"
)

// 处理器定义
type OpenAIFunctionStreamHandler struct {
	FullText string
	ID       string
	FuncName string
	FuncArgs string
	// ToolCalls *llms.ToolCall // 通过 ID 聚合
}

// StreamingFunc: 用于 llms.WithStreamingFunc(handler.Handle)
type ToolCall struct {
	ID       string        `json:"id"`
	Type     string        `json:"type"`
	Function *FunctionCall `json:"function"` // 与 JSON 中字段一致
}

type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

func (h *OpenAIFunctionStreamHandler) Handle(ctx context.Context, data []byte) error {
	var chunks []ToolCall

	if err := json.Unmarshal(data, &chunks); err != nil {
		// logger.Get().Debug().Msg("this is a text content")
		h.FullText += string(data)
		fmt.Print(string(data))
		return nil
	}

	for _, chunk := range chunks {
		if chunk.Function != nil {
			// ToolCall 情况：拼接 arguments
			if chunk.ID != "" {
				h.ID = chunk.ID
			}
			if chunk.Function.Name != "" {
				h.FuncName = chunk.Function.Name
			}
			h.FuncArgs += chunk.Function.Arguments
		}
	}

	return nil
}

// 判断是否有 ToolCall
func (h *OpenAIFunctionStreamHandler) HasFunctionCall() bool {
	return h.FuncName != "" || h.ID != ""
}

// 将 JSON arguments 转为 map
func (h *OpenAIFunctionStreamHandler) ParsedArgs() (map[string]interface{}, error) {
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(h.FuncArgs), &parsed); err != nil {
		logger.Get().Error().Err(err).Msgf("format args failed: %v", h.FuncArgs)
		return nil, fmt.Errorf("failed to parse arguments: %w", err)
	}
	return parsed, nil
}

func (h *OpenAIFunctionStreamHandler) GetFunctionCall() (*llms.FunctionCall, error) {
	_, err := h.ParsedArgs()
	if err != nil {
		return nil, fmt.Errorf("failed to parse the args, not a JSON string: %v", h.FuncArgs)
	}

	return &llms.FunctionCall{
		Name:      h.FuncName,
		Arguments: h.FuncArgs,
	}, nil
}
