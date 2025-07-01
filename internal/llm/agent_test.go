package llm

import (
	"bytes"
	"context"
	"io"
	"os"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/memory"
)

// redirectOutput captures stdout to a buffer for testing purposes.
func redirectOutput(t *testing.T) (*bytes.Buffer, func()) {
	t.Helper()
	old := os.Stdout
	r, w, err := os.Pipe()
	require.NoError(t, err)
	os.Stdout = w

	var buf bytes.Buffer
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(&buf, r)
	}()

	cleanup := func() {
		w.Close()
		wg.Wait()
		os.Stdout = old
	}
	return &buf, cleanup
}

// MockLLM is a mock implementation of the llmContentGenerator interface for testing.
type MockLLM struct {
	GenerateContentResponse *llms.ContentResponse
	GenerateContentError    error
	// We don't need StreamingChunks anymore for fine-grained tests
}

// GenerateContent simulates the LLM's content generation by returning a predefined response.
func (m *MockLLM) GenerateContent(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
	if m.GenerateContentError != nil {
		return nil, m.GenerateContentError
	}

	// For fine-grained testing, we don't need to simulate the streaming function call.
	// We just return the mock response.
	return m.GenerateContentResponse, nil
}

func TestCreateStreamingProcessor(t *testing.T) {
	testCases := []struct {
		name           string
		chunks         [][]byte
		expectedOutput string
	}{
		{
			name: "Complete JSON ContentChoice in one chunk",
			chunks: [][]byte{
				[]byte(`{"Content":"This is a test."}`),
			},
			expectedOutput: "This is a test.",
		},
		{
			name: "Fragmented JSON ContentChoice",
			chunks: [][]byte{
				[]byte(`{"Content":"Part 1`),
				[]byte(` of the message."}`),
			},
			expectedOutput: "Part 1 of the message.",
		},
		{
			name: "Stream with ReasoningContent",
			chunks: [][]byte{
				[]byte(`{"Content":"Okay.","ReasoningContent":"Thinking about it."}`),
			},
			expectedOutput: "Okay.\n[思考中]... Thinking about it.\n",
		},
		{
			name: "Incomplete JSON is buffered and not printed",
			chunks: [][]byte{
				[]byte(`{"Content":"incomplete`),
			},
			expectedOutput: "",
		},
		{
			name: "JSON with ToolCall is not printed",
			chunks: [][]byte{
				[]byte(`{"ToolCalls":[{"ID":"call123","Type":"function","FunctionCall":{"Name":"test_tool","Arguments":"{}"}}]}`),
			},
			expectedOutput: "", // Tool calls should not be printed to stdout
		},
		{
			name: "Mixed stream of text and tool calls",
			chunks: [][]byte{
				[]byte(`{"Content":"First part. "}`),
				[]byte(`{"ToolCalls":[{"ID":"call123","Type":"function","FunctionCall":{"Name":"test_tool","Arguments":"{}"}}]}`),
				[]byte(`{"Content":" Second part."}`),
			},
			expectedOutput: "First part.  Second part.",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// The contentBuilder is no longer needed.
			finalResponse := &llms.ContentResponse{
				Choices: []*llms.ContentChoice{{}},
			}
			processor := createStreamingProcessor(finalResponse)

			outputBuf, cleanup := redirectOutput(t)
			defer cleanup()

			for _, chunk := range tc.chunks {
				err := processor(context.Background(), chunk)
				assert.NoError(t, err)
			}

			// Close the writer to ensure the reader gets EOF and the goroutine finishes.
			cleanup()

			assert.Equal(t, tc.expectedOutput, outputBuf.String(), "stdout should match expected output")
		})
	}
}

func TestHandleToolCallAndRespond(t *testing.T) {
	ctx := context.Background()
	chatMemory := memory.NewConversationBuffer()
	_ = chatMemory.ChatHistory.AddMessage(ctx, llms.HumanChatMessage{Content: "find a flight"})
	_ = chatMemory.ChatHistory.AddMessage(ctx, llms.AIChatMessage{
		Content:   "I can help with that.",
		ToolCalls: []llms.ToolCall{{ID: "tool123", FunctionCall: &llms.FunctionCall{Name: "search_flights"}}},
	})

	// Mock the LLM's response AFTER the tool call.
	// We are NOT testing streaming here, just the function's logic.
	mockLLM := &MockLLM{
		GenerateContentResponse: &llms.ContentResponse{
			Choices: []*llms.ContentChoice{
				{Content: "Okay, I have found a flight for you. It departs at 10 AM."},
			},
		},
	}

	// Mock the tool execution.
	originalExecuteMCPTool := ExecuteMCPTool
	ExecuteMCPTool = func(ctx context.Context, name, args string) (string, error) {
		assert.Equal(t, "search_flights", name)
		assert.Equal(t, `{"destination":"TKO"}`, args)
		return `{"status":"success", "flight_id":"FL456"}`, nil
	}
	defer func() { ExecuteMCPTool = originalExecuteMCPTool }()

	toolCall := llms.ToolCall{
		ID:   "tool123",
		Type: "function",
		FunctionCall: &llms.FunctionCall{
			Name:      "search_flights",
			Arguments: `{"destination":"TKO"}`,
		},
	}

	// We don't care about the printed output in this fine-grained test.
	// We only care about the final state of the memory.
	_, cleanup := redirectOutput(t)
	defer cleanup()

	err := HandleToolCallAndRespond(ctx, toolCall, mockLLM, chatMemory)
	require.NoError(t, err)

	// Verify the memory state is correct.
	messages, err := chatMemory.ChatHistory.Messages(ctx)
	require.NoError(t, err)
	require.Len(t, messages, 4, "Memory should have 4 messages: Human, AI (tool call), Tool, AI (final response)")

	// 1. Human message (already there)
	// 2. AI message with tool call (already there)

	// 3. Tool response message
	toolMessage, ok := messages[2].(llms.ToolChatMessage)
	require.True(t, ok, "Third message should be a ToolChatMessage")
	assert.Equal(t, "tool123", toolMessage.ID)
	assert.Equal(t, `{"status":"success", "flight_id":"FL456"}`, toolMessage.Content)

	// 4. Final AI response message
	aiMessage, ok := messages[3].(llms.AIChatMessage)
	require.True(t, ok, "Fourth message should be an AIChatMessage")
	assert.Equal(t, "Okay, I have found a flight for you. It departs at 10 AM.", aiMessage.Content)
}

// MockLLMForStream is a mock that simulates the streaming behavior by calling the streaming function.
type MockLLMForStream struct {
	ChunksToStream [][]byte
	StaticResponse *llms.ContentResponse // Response returned by GenerateContent
	GenerateError  error
}

func (m *MockLLMForStream) GenerateContent(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
	if m.GenerateError != nil {
		return nil, m.GenerateError
	}

	opts := llms.CallOptions{}
	for _, opt := range options {
		opt(&opts)
	}
	streamFunc := opts.StreamingFunc

	if streamFunc != nil {
		for _, chunk := range m.ChunksToStream {
			if err := streamFunc(ctx, chunk); err != nil {
				return nil, err
			}
		}
	}

	return m.StaticResponse, nil
}

func TestGenerateResponseNew_WithMultipleToolCalls(t *testing.T) {
	t.Parallel()

	// 1. Setup
	ctx := context.Background()
	chatMemory := memory.NewConversationBuffer()
	_ = chatMemory.ChatHistory.AddMessage(ctx, llms.HumanChatMessage{Content: "Book a flight to Tokyo and a hotel there for 3 nights."})

	// 2. Mock LLM Stream according to the new logic
	mockLLM := &MockLLMForStream{
		ChunksToStream: [][]byte{
			// First tool call: book_flight
			[]byte(`[{"id":"call_1","type":"function","function":{"name":"book_flight","arguments":"{\"destination\":"}}]`),
			[]byte(`[{"function":{"arguments":"\"Tokyo\""}}]`),
			[]byte(`[{"function":{"arguments":"}"}}]`),
			// Second tool call: book_hotel
			[]byte(`[{"id":"call_2","type":"function","function":{"name":"book_hotel","arguments":"{\"city\":\"Tokyo\","}}]`),
			[]byte(`[{"function":{"arguments":"\"nights\":3"}}]`),
			[]byte(`[{"function":{"arguments":"}"}}]`),
		},
		StaticResponse: &llms.ContentResponse{
			Choices: []*llms.ContentChoice{
				{StopReason: "tool_calls"},
			},
		},
	}

	// 3. Execute
	// We don't care about the printed output in this test.
	_, cleanup := redirectOutput(t)
	defer cleanup()

	choice, interrupted, err := GenerateResponseNew(ctx, mockLLM, chatMemory, nil)

	// 4. Assert
	require.NoError(t, err)
	require.False(t, interrupted, "Should not be interrupted in this test case")
	require.NotNil(t, choice)

	assert.Equal(t, "tool_calls", choice.StopReason)
	assert.Empty(t, choice.Content, "Content should be empty when only tool calls are made")
	require.Len(t, choice.ToolCalls, 2, "Should have two tool calls")

	expectedToolCalls := []llms.ToolCall{
		{
			ID:   "call_1",
			Type: "function",
			FunctionCall: &llms.FunctionCall{
				Name:      "book_flight",
				Arguments: `{"destination":"Tokyo"}`,
			},
		},
		{
			ID:   "call_2",
			Type: "function",
			FunctionCall: &llms.FunctionCall{
				Name:      "book_hotel",
				Arguments: `{"city":"Tokyo","nights":3}`,
			},
		},
	}

	// Use require.Equal because the order is now guaranteed by the handler
	require.Equal(t, expectedToolCalls, choice.ToolCalls)

	// 5. Verify memory
	messages, err := chatMemory.ChatHistory.Messages(ctx)
	require.NoError(t, err)
	require.Len(t, messages, 2, "Memory should have human and AI message")

	aiMessage, ok := messages[1].(llms.AIChatMessage)
	require.True(t, ok, "The second message should be an AI message")
	assert.Empty(t, aiMessage.Content)
	require.Equal(t, expectedToolCalls, aiMessage.ToolCalls)
}
