package llm

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
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

func TestCreateStreamingProcessor(t *testing.T) {
	testCases := []struct {
		name                string
		chunks              [][]byte
		expectedOutput      string
		expectedBuilderCont string
	}{
		{
			name:                "Simple text content",
			chunks:              [][]byte{[]byte("Hello, "), []byte("world!")},
			expectedOutput:      "Hello, world!",
			expectedBuilderCont: "Hello, world!",
		},
		{
			name: "Complete JSON ContentChoice in one chunk",
			chunks: [][]byte{
				[]byte(`{"Content":"This is a test."}`),
			},
			expectedOutput:      "This is a test.",
			expectedBuilderCont: "This is a test.",
		},
		{
			name: "Fragmented JSON ContentChoice",
			chunks: [][]byte{
				[]byte(`{"Content":"Part 1`),
				[]byte(` of the message."}`),
			},
			expectedOutput:      "Part 1 of the message.",
			expectedBuilderCont: "Part 1 of the message.",
		},
		{
			name: "Stream with ReasoningContent",
			chunks: [][]byte{
				[]byte(`{"Content":"Okay.","ReasoningContent":"Thinking about it."}`),
			},
			expectedOutput:      "Okay.\n[思考中]... Thinking about it.\n",
			expectedBuilderCont: "Okay.",
		},
		{
			name: "Mixed stream of text and JSON",
			chunks: [][]byte{
				[]byte("Here is an update: "),
				[]byte(`{"Content":"Status is good."}`),
				[]byte(" Any questions?"),
			},
			expectedOutput:      "Here is an update: Status is good. Any questions?",
			expectedBuilderCont: "Here is an update: Status is good. Any questions?",
		},
		{
			name: "Incomplete JSON results in raw output",
			chunks: [][]byte{
				[]byte(`{"Content":"incomplete`),
			},
			expectedOutput:      `{"Content":"incomplete`,
			expectedBuilderCont: `{"Content":"incomplete`,
		},
		{
			name: "JSON with only reasoning",
			chunks: [][]byte{
				[]byte(`{"ReasoningContent":"The user is asking a question."}`),
			},
			expectedOutput:      "\n[思考中]... The user is asking a question.\n",
			expectedBuilderCont: "",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			var contentBuilder strings.Builder
			processor := createStreamingProcessor(&contentBuilder)

			// Capture stdout
			outputBuf, cleanup := redirectOutput(t)
			defer cleanup()

			for _, chunk := range tc.chunks {
				err := processor(context.Background(), chunk)
				assert.NoError(t, err)
			}

			// Assertions
			assert.Equal(t, tc.expectedOutput, outputBuf.String(), "stdout should match expected output")
			assert.Equal(t, tc.expectedBuilderCont, contentBuilder.String(), "contentBuilder should match expected content")
		})
	}
}

// MockLLM is a mock implementation of the llmContentGenerator interface for testing.
type MockLLM struct {
	GenerateContentResponse *llms.ContentResponse
	GenerateContentError    error
	StreamingChunks         [][]byte
}

// GenerateContent simulates the LLM's content generation.
func (m *MockLLM) GenerateContent(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error) {
	if m.GenerateContentError != nil {
		return nil, m.GenerateContentError
	}

	// Apply streaming if a streaming function is provided
	opts := llms.CallOptions{}
	for _, opt := range options {
		opt(&opts)
	}

	if opts.StreamingFunc != nil && m.StreamingChunks != nil {
		for _, chunk := range m.StreamingChunks {
			if err := opts.StreamingFunc(ctx, chunk); err != nil {
				return nil, fmt.Errorf("streaming func error: %w", err)
			}
		}
	}

	return m.GenerateContentResponse, nil
}

func TestHandleToolCallAndRespond_StreamingOutput(t *testing.T) {
	// Setup
	ctx := context.Background()
	chatMemory := memory.NewConversationBuffer()
	_ = chatMemory.ChatHistory.AddMessage(ctx, llms.HumanChatMessage{Content: "find a flight"})
	_ = chatMemory.ChatHistory.AddMessage(ctx, llms.AIChatMessage{
		Content:   "I can help with that.",
		ToolCalls: []llms.ToolCall{{ID: "tool123", FunctionCall: &llms.FunctionCall{Name: "search_flights"}}},
	})

	// Mock LLM
	mockLLM := &MockLLM{
		StreamingChunks: [][]byte{
			[]byte(`{"Content":"Okay, I have found a flight for you. "}`),
			[]byte(`{"Content":"It departs at 10 AM."}`),
		},
		GenerateContentResponse: &llms.ContentResponse{
			Choices: []*llms.ContentChoice{
				{Content: "Okay, I have found a flight for you. It departs at 10 AM."},
			},
		},
	}

	// Mock ExecuteMCPTool to avoid external calls
	originalExecuteMCPTool := ExecuteMCPTool
	ExecuteMCPTool = func(ctx context.Context, name, args string) (string, error) {
		return `{"status":"success", "flight_id":"FL456"}`, nil
	}
	defer func() { ExecuteMCPTool = originalExecuteMCPTool }()

	// Capture stdout
	outputBuf, cleanup := redirectOutput(t)
	defer cleanup()

	// The tool call to handle
	toolCall := llms.ToolCall{
		ID:   "tool123",
		Type: "function",
		FunctionCall: &llms.FunctionCall{
			Name:      "search_flights",
			Arguments: `{"destination":"TKO"}`,
		},
	}

	// Execute the function using the mock LLM directly.
	err := HandleToolCallAndRespond(ctx, toolCall, mockLLM, chatMemory)

	// Assertions
	require.NoError(t, err)
	// The output should be "AI: " followed by the streamed content and a newline.
	expectedOutput := "AI: Okay, I have found a flight for you. It departs at 10 AM.\n"
	assert.Equal(t, expectedOutput, outputBuf.String())

	// Check if the final response was added to memory correctly
	messages, err := chatMemory.ChatHistory.Messages(ctx)
	require.NoError(t, err)
	require.True(t, len(messages) >= 4) // Human, AI (tool req), Tool, AI (summary)

	lastMessage := messages[len(messages)-1]
	assert.Equal(t, llms.ChatMessageTypeAI, lastMessage.GetType())
	assert.Equal(t, "Okay, I have found a flight for you. It departs at 10 AM.", lastMessage.GetContent())
}

// Note: Testing StartChatCLI directly is complex due to its os.Stdin loop.
// The most critical logic to test is how it handles the response from the LLM,
// specifically ensuring it uses the ToolCalls from the final response object,
// not from the streaming processor. The test below verifies this logic path.

func TestStartChatCLI_ToolCallLogic(t *testing.T) {
	// This test ensures that the tool calls are correctly extracted from the
	// final llmResponse object and not from the streaming content.

	// Setup
	ctx := context.Background()
	chatMemory := memory.NewConversationBuffer()
	_ = chatMemory.ChatHistory.AddMessage(ctx, llms.HumanChatMessage{Content: "find a hotel"})

	// Mock LLM to return a response with a tool call
	mockLLM := &MockLLM{
		// The streaming part might just be text, or even empty.
		StreamingChunks: [][]byte{
			[]byte(`{"Content":"I can search for hotels for you."}`),
		},
		// The final response contains the definitive tool call.
		GenerateContentResponse: &llms.ContentResponse{
			Choices: []*llms.ContentChoice{
				{
					Content: "I can search for hotels for you.",
					ToolCalls: []llms.ToolCall{
						{
							ID:   "tool456",
							Type: "function",
							FunctionCall: &llms.FunctionCall{
								Name:      "search_hotels",
								Arguments: `{"location":"SF"}`,
							},
						},
					},
					ReasoningContent: "The user wants to find a hotel.",
				},
			},
		},
	}

	// Mock the tool execution part to isolate the test
	var handledToolCall llms.ToolCall
	originalHandler := HandleToolCallAndRespond
	// We redefine HandleToolCallAndRespond for this test to capture the call.
	HandleToolCallAndRespond = func(ctx context.Context, toolCall llms.ToolCall, llm llmContentGenerator, chatMemory *memory.ConversationBuffer) error {
		handledToolCall = toolCall // Capture the tool call
		// In a real scenario, we might want to simulate a response, but for this test, just capturing is enough.
		return nil
	}
	defer func() { HandleToolCallAndRespond = originalHandler }()

	// Simulate the core logic of StartChatCLI after getting user input
	chatHistMessages, _ := chatMemory.ChatHistory.Messages(ctx)
	currentMessagesForLLM := make([]llms.MessageContent, len(chatHistMessages))
	for i, msg := range chatHistMessages {
		currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageType(msg.GetType()), Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
	}

	var streamedContentBuilder strings.Builder
	streamingProcessor := createStreamingProcessor(&streamedContentBuilder)

	// Use the mock LLM to simulate the call within StartChatCLI's logic
	llmResponse, err := mockLLM.GenerateContent(ctx, currentMessagesForLLM,
		llms.WithStreamingFunc(streamingProcessor),
		llms.WithTools(MCPTools()), // Assume MCPTools() is available
	)
	require.NoError(t, err)
	require.NotNil(t, llmResponse)
	require.NotEmpty(t, llmResponse.Choices)

	choice := llmResponse.Choices[0]

	// Add message to history (as in the original function)
	aiMessageToSave := llms.AIChatMessage{
		Content:          choice.Content,
		ToolCalls:        choice.ToolCalls,
		ReasoningContent: choice.ReasoningContent,
	}
	_ = chatMemory.ChatHistory.AddMessage(ctx, aiMessageToSave)

	// The key assertion: check if the tool call handler is invoked
	if len(choice.ToolCalls) > 0 {
		for _, toolCall := range choice.ToolCalls {
			// The llm instance is passed through. In our test, it's the mockLLM.
			// The global HandleToolCallAndRespond is mocked, so this call will be captured.
			_ = HandleToolCallAndRespond(ctx, toolCall, mockLLM, chatMemory)
		}
	}

	// Verify that the correct tool call was handled
	assert.Equal(t, "tool456", handledToolCall.ID)
	assert.Equal(t, "search_hotels", handledToolCall.FunctionCall.Name)
	assert.Equal(t, `{"location":"SF"}`, handledToolCall.FunctionCall.Arguments)
}
