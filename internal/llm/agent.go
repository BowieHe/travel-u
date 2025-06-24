package llm

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/BowieHe/travel-u/pkg/model"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/memory"
)

// llmContentGenerator defines an interface for generating content, making it easier to mock the LLM.
type llmContentGenerator interface {
	GenerateContent(ctx context.Context, messages []llms.MessageContent, options ...llms.CallOption) (*llms.ContentResponse, error)
}

// HandleToolCallAndRespond processes a tool call from the LLM, executes it, and sends the result back.
// It's a variable to allow for easy mocking in tests.
var HandleToolCallAndRespond = func(ctx context.Context, toolCall llms.ToolCall, llm llmContentGenerator, chatMemory *memory.ConversationBuffer) error {
	if toolCall.FunctionCall == nil {
		logger.Get().Error().Msg("ToolCall received with nil FunctionCall")
		return errors.New("nil FunctionCall in toolCall")
	}

	logger.Get().Debug().Msgf("LLM requests tool call. ID: %s, Name: %s, Args: %s",
		toolCall.ID, toolCall.FunctionCall.Name, toolCall.FunctionCall.Arguments)

	toolResultContent, err := ExecuteMCPTool(ctx, toolCall.FunctionCall.Name, toolCall.FunctionCall.Arguments)
	if err != nil {
		logger.Get().Error().Err(err).Msgf("Failed to execute LLM tool '%s'", toolCall.FunctionCall.Name)
		toolResultContent = fmt.Sprintf("Error executing tool %s: %v", toolCall.FunctionCall.Name, err)
	}

	toolResponseMsg := llms.ToolChatMessage{Content: toolResultContent, ID: toolCall.ID}
	if err := chatMemory.ChatHistory.AddMessage(ctx, toolResponseMsg); err != nil {
		logger.Get().Error().Err(err).Msg("Failed to add tool response to chat memory")
		return fmt.Errorf("failed to add tool response to memory: %w", err)
	}
	logger.Get().Debug().Msgf("Added tool response to memory. ToolID: %s, Content: %s", toolCall.ID, toolResultContent)

	chatMessages, err := chatMemory.ChatHistory.Messages(ctx)
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to get messages from chat memory after tool call")
		return fmt.Errorf("failed to get messages from memory: %w", err)
	}

	messagesForLLM := make([]llms.MessageContent, len(chatMessages))
	for i, msg := range chatMessages {
		switch msg.GetType() {
		case llms.ChatMessageTypeSystem:
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeSystem, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		case llms.ChatMessageTypeHuman:
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeHuman, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		case llms.ChatMessageTypeAI:
			aiMsg, ok := msg.(llms.AIChatMessage)
			if !ok {
				logger.Get().Error().Msgf("Could not cast AI message from history to llms.AIChatMessage: %+v", msg)
				messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
				continue
			}

			parts := []llms.ContentPart{llms.TextContent{Text: aiMsg.Content}}
			if len(aiMsg.ToolCalls) > 0 {
				for _, tc := range aiMsg.ToolCalls {
					parts = append(parts, llms.ToolCall{
						ID:   tc.ID,
						Type: tc.Type,
						FunctionCall: &llms.FunctionCall{
							Name:      tc.FunctionCall.Name,
							Arguments: tc.FunctionCall.Arguments,
						},
					})
				}
			}
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: parts}

		case llms.ChatMessageTypeTool:
			toolMsg, ok := msg.(llms.ToolChatMessage)
			if !ok {
				logger.Get().Error().Msgf("Could not cast Tool message from history to llms.ToolChatMessage: %+v", msg)
				messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeTool, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
				continue
			}
			messagesForLLM[i] = llms.MessageContent{
				Role: llms.ChatMessageTypeTool,
				Parts: []llms.ContentPart{
					llms.ToolCallResponse{
						ToolCallID: toolMsg.ID,
						Name:       toolCall.FunctionCall.Name,
						Content:    toolMsg.Content,
					},
				},
			}
		default:
			logger.Get().Warn().Msgf("Unhandled chat message type in history for LLM conversion: %s", msg.GetType())
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageType(msg.GetType()), Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		}
	}

	fmt.Print("AI: ")
	var finalResponseBuilder strings.Builder
	// Stream the final response from the LLM.
	streamingProcessor := createStreamingProcessor(&finalResponseBuilder)
	llmResponse, err := llm.GenerateContent(ctx, messagesForLLM,
		llms.WithStreamingFunc(streamingProcessor),
	)
	if err != nil {
		logger.Get().Error().Err(err).Msg("LLM GenerateContent failed after tool call")
		fmt.Printf("\nError from LLM after tool call: %v\n", err)
		return fmt.Errorf("LLM GenerateContent failed after tool call: %w", err)
	}
	fmt.Println()

	// The authoritative response comes from the return value, not the stream builder.
	// The stream is for display purposes.
	if llmResponse == nil || len(llmResponse.Choices) == 0 {
		logger.Get().Warn().Msg("LLM response was empty after tool call, nothing to save to memory.")
		return nil
	}

	choice := llmResponse.Choices[0]
	aiMsg := llms.AIChatMessage{
		Content:          choice.Content,
		ToolCalls:        choice.ToolCalls,
		ReasoningContent: choice.ReasoningContent,
	}
	if err := chatMemory.ChatHistory.AddMessage(ctx, aiMsg); err != nil {
		logger.Get().Error().Err(err).Msg("Failed to add final AI response to chat memory")
		return fmt.Errorf("failed to add final AI response to memory: %w", err)
	}
	logger.Get().Debug().Msgf("Added final AI response to memory: %s", choice.Content)
	return nil
}

// StartChatCLI starts a command-line interface for the streaming chat application.
func StartChatCLI(cancel context.CancelFunc) {
	llm, err := model.GetOpenAI(types.LLMOption{})
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to get OpenAI LLM for StartChatCLI")
		return
	}

	chatMemory := memory.NewConversationBuffer()
	ctx := context.Background()

	fmt.Println("Streaming Chat Application Started! Type 'quit' to exit.")
	scanner := bufio.NewScanner(os.Stdin)

	for {
		fmt.Print("You: ")
		if !scanner.Scan() {
			break
		}
		userInput := strings.TrimSpace(scanner.Text())
		if userInput == "quit" {
			cancel()
			return
		}
		if userInput == "" {
			continue
		}

		if err := chatMemory.ChatHistory.AddMessage(ctx, llms.HumanChatMessage{Content: userInput}); err != nil {
			logger.Get().Error().Err(err).Msg("Failed to add user message to memory")
			continue
		}

		chatHistMessages, err := chatMemory.ChatHistory.Messages(ctx)
		if err != nil {
			logger.Get().Error().Err(err).Msg("Failed to get messages from memory for LLM call")
			continue
		}

		currentMessagesForLLM := make([]llms.MessageContent, len(chatHistMessages))
		for i, msg := range chatHistMessages {
			switch msg.GetType() {
			case llms.ChatMessageTypeSystem:
				currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeSystem, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
			case llms.ChatMessageTypeHuman:
				currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeHuman, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
			case llms.ChatMessageTypeAI:
				aiMsg, ok := msg.(llms.AIChatMessage)
				if !ok {
					logger.Get().Error().Msgf("Could not cast AI message from history to llms.AIChatMessage: %+v", msg)
					currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
					continue
				}
				parts := []llms.ContentPart{llms.TextContent{Text: aiMsg.Content}}
				if len(aiMsg.ToolCalls) > 0 {
					for _, tc := range aiMsg.ToolCalls {
						parts = append(parts, llms.ToolCall{
							ID:   tc.ID,
							Type: tc.Type,
							FunctionCall: &llms.FunctionCall{
								Name:      tc.FunctionCall.Name,
								Arguments: tc.FunctionCall.Arguments,
							},
						})
					}
				}
				currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: parts}
			case llms.ChatMessageTypeTool:
				toolMsg, ok := msg.(llms.ToolChatMessage)
				if !ok {
					logger.Get().Error().Msgf("Could not cast Tool message from history to llms.ToolChatMessage: %+v", msg)
					currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeTool, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
					continue
				}
				currentMessagesForLLM[i] = llms.MessageContent{
					Role: llms.ChatMessageTypeTool,
					Parts: []llms.ContentPart{
						llms.ToolCallResponse{
							ToolCallID: toolMsg.ID,
							Content:    toolMsg.Content,
						},
					},
				}
			default:
				logger.Get().Warn().Msgf("Unhandled chat message type in history for LLM conversion: %s", msg.GetType())
				currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageType(msg.GetType()), Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
			}
		}

		fmt.Print("AI: ")
		var streamedContentBuilder strings.Builder
		streamingProcessor := createStreamingProcessor(&streamedContentBuilder)
		llmResponse, err := llm.GenerateContent(ctx, currentMessagesForLLM,
			llms.WithStreamingFunc(streamingProcessor),
			llms.WithTools(MCPTools()),
		)
		fmt.Println()

		if err != nil {
			logger.Get().Error().Err(err).Msg("LLM GenerateContent failed")
			fmt.Printf("Error from LLM: %v\n", err)
			continue
		}

		if len(llmResponse.Choices) == 0 {
			logger.Get().Error().Msg("LLM response was empty")
			fmt.Println("LLM returned an empty response.")
			continue
		}

		choice := llmResponse.Choices[0]

		if choice.ReasoningContent != "" {
			fmt.Printf("\n[思考中]... %s\n", choice.ReasoningContent)
		}

		aiMessageToSave := llms.AIChatMessage{
			Content:          choice.Content,
			ToolCalls:        choice.ToolCalls,
			ReasoningContent: choice.ReasoningContent,
		}
		if err := chatMemory.ChatHistory.AddMessage(ctx, aiMessageToSave); err != nil {
			logger.Get().Error().Err(err).Msg("Failed to add AI message to memory")
			continue
		}
		logger.Get().Debug().Msgf("Added AI message to memory. Content: '%s', ToolCalls: %d", choice.Content, len(choice.ToolCalls))

		if len(choice.ToolCalls) > 0 {
			for _, toolCall := range choice.ToolCalls {
				if err := HandleToolCallAndRespond(ctx, toolCall, llm, chatMemory); err != nil {
					logger.Get().Error().Err(err).Msgf("Error handling tool call ID %s", toolCall.ID)
					fmt.Printf("Error processing tool call: %v\n", err)
				}
			}
		}
	}
}

// createStreamingProcessor creates a closure that handles streaming content.
// This version uses a simpler, more robust heuristic.
func createStreamingProcessor(contentBuilder *strings.Builder) func(ctx context.Context, chunk []byte) error {
	var buffer strings.Builder
	return func(ctx context.Context, chunk []byte) error {
		// Append the new chunk to our internal buffer.
		buffer.Write(chunk)

		// Make a copy of the current buffer content for processing.
		currentContent := buffer.String()
		var choice llms.ContentChoice

		// Try to unmarshal the entire buffer. If it succeeds, we have a complete JSON object.
		if err := json.Unmarshal([]byte(currentContent), &choice); err == nil {
			if choice.Content != "" {
				fmt.Print(choice.Content)
				contentBuilder.WriteString(choice.Content)
			}
			if choice.ReasoningContent != "" {
				fmt.Printf("\n[思考中]... %s\n", choice.ReasoningContent)
			}
			// It was a complete object, so we can clear the buffer for the next one.
			buffer.Reset()
		} else {
			// It's not a complete JSON object. This could be because it's fragmented, or it's plain text.
			// We use a heuristic: if the buffer (trimmed of whitespace) doesn't start with '{',
			// we assume it's plain text and not a JSON object in the making.
			trimmedContent := strings.TrimSpace(currentContent)
			if !strings.HasPrefix(trimmedContent, "{") {
				// It's likely plain text. Print it and clear the buffer.
				fmt.Print(currentContent)
				contentBuilder.WriteString(currentContent)
				buffer.Reset()
			}
			// Otherwise, we assume it's an incomplete JSON object and wait for more chunks to arrive.
		}
		return nil
	}
}
