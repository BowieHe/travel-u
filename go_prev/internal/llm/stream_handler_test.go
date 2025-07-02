package llm

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tmc/langchaingo/llms"
)

func TestOpenAIFunctionStreamHandler_Handle(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name              string
		chunks            [][]byte
		expectedFullText  string
		expectedToolCalls map[string]*llms.ToolCall
		expectedOrder     []string
	}{
		{
			name: "single tool call split into multiple chunks",
			chunks: [][]byte{
				[]byte(`[{"id":"call_1","type":"function","function":{"name":"get_weather","arguments":"{\"location\":"}}]`),
				[]byte(`[{"function":{"arguments":"\"beijing\""}}]`),
				[]byte(`[{"function":{"arguments":"}"}}]`),
			},
			expectedFullText: "",
			expectedToolCalls: map[string]*llms.ToolCall{
				"call_1": {
					ID:   "call_1",
					Type: "function",
					FunctionCall: &llms.FunctionCall{
						Name:      "get_weather",
						Arguments: `{"location":"beijing"}`,
					},
				},
			},
			expectedOrder: []string{"call_1"},
		},
		{
			name: "multiple sequential tool calls",
			chunks: [][]byte{
				// First tool call
				[]byte(`[{"id":"call_1","type":"function","function":{"name":"get_weather"}}]`),
				[]byte(`[{"function":{"arguments":"{\"location\":"}}]`),
				[]byte(`[{"function":{"arguments":"\"beijing\"}"}}]`),
				// Second tool call
				[]byte(`[{"id":"call_2","type":"function","function":{"name":"get_flight","arguments":"{\"from\":\"shanghai\","}}]`),
				[]byte(`[{"function":{"arguments":"\"to\":\"beijing\"}"}}]`),
			},
			expectedFullText: "",
			expectedToolCalls: map[string]*llms.ToolCall{
				"call_1": {
					ID:   "call_1",
					Type: "function",
					FunctionCall: &llms.FunctionCall{
						Name:      "get_weather",
						Arguments: `{"location":"beijing"}`,
					},
				},
				"call_2": {
					ID:   "call_2",
					Type: "function",
					FunctionCall: &llms.FunctionCall{
						Name:      "get_flight",
						Arguments: `{"from":"shanghai","to":"beijing"}`,
					},
				},
			},
			expectedOrder: []string{"call_1", "call_2"},
		},
		{
			name: "pure text stream",
			chunks: [][]byte{
				[]byte("Hello"),
				[]byte(", "),
				[]byte("world!"),
			},
			expectedFullText:  "Hello, world!",
			expectedToolCalls: map[string]*llms.ToolCall{},
			expectedOrder:     []string{},
		},
		{
			name: "mixed stream with text and tool calls",
			chunks: [][]byte{
				[]byte("Thinking..."),
				[]byte(`[{"id":"call_123","type":"function","function":{"name":"search_tool"}}]`),
				[]byte("Now calling the tool..."),
				[]byte(`[{"function":{"arguments":"{\"query\":\"golang\"}"}}]`),
			},
			expectedFullText: "Thinking...Now calling the tool...",
			expectedToolCalls: map[string]*llms.ToolCall{
				"call_123": {
					ID:   "call_123",
					Type: "function",
					FunctionCall: &llms.FunctionCall{
						Name:      "search_tool",
						Arguments: `{"query":"golang"}`,
					},
				},
			},
			expectedOrder: []string{"call_123"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			handler := NewOpenAIFunctionStreamHandler()
			ctx := context.Background()

			for _, chunk := range tt.chunks {
				err := handler.Handle(ctx, chunk)
				require.NoError(t, err)
			}

			assert.Equal(t, tt.expectedFullText, handler.FullText)
			require.Equal(t, len(tt.expectedToolCalls), len(handler.ToolCalls), "number of tool calls should match")
			assert.Equal(t, tt.expectedOrder, handler.toolCallOrder, "tool call order should be correct")

			for id, expectedCall := range tt.expectedToolCalls {
				actualCall, ok := handler.ToolCalls[id]
				require.True(t, ok, "tool call with id %s not found", id)
				assert.Equal(t, expectedCall, actualCall)
			}
		})
	}
}

func TestOpenAIFunctionStreamHandler_GetToolCalls(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name          string
		handlerState  *OpenAIFunctionStreamHandler
		expectError   bool
		expectedCalls []llms.ToolCall
	}{
		{
			name: "valid tool calls in order",
			handlerState: &OpenAIFunctionStreamHandler{
				ToolCalls: map[string]*llms.ToolCall{
					"call_1": {ID: "call_1", Type: "function", FunctionCall: &llms.FunctionCall{Name: "get_weather", Arguments: `{"location": "Tokyo"}`}},
					"call_2": {ID: "call_2", Type: "function", FunctionCall: &llms.FunctionCall{Name: "get_stock", Arguments: `{"ticker": "GOOGL"}`}},
				},
				toolCallOrder: []string{"call_1", "call_2"},
			},
			expectError: false,
			expectedCalls: []llms.ToolCall{
				{ID: "call_1", Type: "function", FunctionCall: &llms.FunctionCall{Name: "get_weather", Arguments: `{"location": "Tokyo"}`}},
				{ID: "call_2", Type: "function", FunctionCall: &llms.FunctionCall{Name: "get_stock", Arguments: `{"ticker": "GOOGL"}`}},
			},
		},
		{
			name: "invalid json in one of the arguments",
			handlerState: &OpenAIFunctionStreamHandler{
				ToolCalls: map[string]*llms.ToolCall{
					"call_1": {ID: "call_1", FunctionCall: &llms.FunctionCall{Name: "get_weather", Arguments: `{"location": "Tokyo"}`}},
					"call_2": {ID: "call_2", FunctionCall: &llms.FunctionCall{Name: "get_stock", Arguments: `{"ticker": "GOOGL"`}}, // Invalid
				},
				toolCallOrder: []string{"call_1", "call_2"},
			},
			expectError:   true,
			expectedCalls: nil,
		},
		{
			name: "no tool calls",
			handlerState: &OpenAIFunctionStreamHandler{
				ToolCalls:     map[string]*llms.ToolCall{},
				toolCallOrder: []string{},
			},
			expectError:   false,
			expectedCalls: []llms.ToolCall{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			handler := tt.handlerState

			calls, err := handler.GetToolCalls()

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, calls)
			} else {
				assert.NoError(t, err)
				// Use require.Equal for ordered comparison
				require.Equal(t, tt.expectedCalls, calls, "returned tool calls should match expected order and content")
			}
		})
	}
}
