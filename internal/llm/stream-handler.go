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
	FullText       string
	ToolCalls      map[string]*llms.ToolCall
	toolCallOrder  []string // Maintain the order of tool calls
	lastToolCallID string   // ID of the last tool call being processed
	Interrupted    bool     // Flag to indicate if an interruption signal is received
}

// NewOpenAIFunctionStreamHandler creates a new handler.
func NewOpenAIFunctionStreamHandler() *OpenAIFunctionStreamHandler {
	return &OpenAIFunctionStreamHandler{
		ToolCalls:     make(map[string]*llms.ToolCall),
		toolCallOrder: make([]string, 0),
	}
}

// ToolCall represents the structure of a tool call chunk from the stream.
type ToolCall struct {
	ID       string        `json:"id"`
	Type     string        `json:"type"`
	Function *FunctionCall `json:"function"`
}

// FunctionCall represents the function part of a tool call.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Handle processes a single chunk of data from the LLM stream.
func (h *OpenAIFunctionStreamHandler) Handle(ctx context.Context, data []byte) error {
	var chunks []ToolCall
	// A chunk can be a tool call or plain text.
	if err := json.Unmarshal(data, &chunks); err != nil || len(chunks) == 0 {
		// If unmarshaling fails or it's an empty array, treat as plain text.
		h.FullText += string(data)
		fmt.Print(string(data))
		return nil
	}

	// According to the new understanding, each `data` contains an array with at most one element.
	chunk := chunks[0]

	if chunk.Function == nil {
		// Not a valid tool call chunk, might be other metadata.
		return nil
	}

	// If the chunk has an ID, it's a new tool call.
	if chunk.ID != "" {
		newToolCall := &llms.ToolCall{
			ID:   chunk.ID,
			Type: chunk.Type,
			FunctionCall: &llms.FunctionCall{
				Name:      chunk.Function.Name,
				Arguments: chunk.Function.Arguments,
			},
		}
		// Check for the interruption signal.
		if newToolCall.FunctionCall.Name == "ask_user_for_input" {
			h.Interrupted = true
			// We can potentially stop processing further chunks after an interruption.
			// For now, we'll just set the flag.
		}

		h.ToolCalls[chunk.ID] = newToolCall
		h.toolCallOrder = append(h.toolCallOrder, chunk.ID)
		h.lastToolCallID = chunk.ID // Track the latest tool call
	} else {
		// If the chunk has no ID, it's a continuation of the last tool call.
		if h.lastToolCallID != "" {
			if toolCall, ok := h.ToolCalls[h.lastToolCallID]; ok {
				toolCall.FunctionCall.Arguments += chunk.Function.Arguments
			}
		}
		// If there's no lastToolCallID, we ignore this chunk as we don't know where to append it.
	}

	return nil
}

// IsInterrupted checks if the handler has been interrupted.
func (h *OpenAIFunctionStreamHandler) IsInterrupted() bool {
	return h.Interrupted
}

// HasFunctionCall checks if there are any aggregated tool calls.
func (h *OpenAIFunctionStreamHandler) HasFunctionCall() bool {
	return len(h.ToolCalls) > 0
}

// GetToolCalls validates and returns all aggregated tool calls in the order they were received.
func (h *OpenAIFunctionStreamHandler) GetToolCalls() ([]llms.ToolCall, error) {
	var calls []llms.ToolCall
	for _, id := range h.toolCallOrder {
		toolCall := h.ToolCalls[id]
		// Validate that the final arguments string is a valid JSON.
		var parsedArgs map[string]interface{}
		if err := json.Unmarshal([]byte(toolCall.FunctionCall.Arguments), &parsedArgs); err != nil {
			logger.Get().Error().Err(err).Msgf("failed to parse arguments for tool call %s: %s", toolCall.ID, toolCall.FunctionCall.Arguments)
			return nil, fmt.Errorf("invalid JSON arguments for tool call %s: %w", toolCall.ID, err)
		}
		calls = append(calls, *toolCall)
	}
	return calls, nil
}
