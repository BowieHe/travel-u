package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/BowieHe/travel-u/pkg/logger"
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
	// Initialize the final response object that the streaming processor will populate.
	// We initialize Choices so we can safely append to Choices[0].
	finalResponse := &llms.ContentResponse{
		Choices: []*llms.ContentChoice{{}},
	}

	// The streaming processor populates the finalResponse object directly.
	streamingProcessor := createStreamingProcessor(finalResponse)
	_, err = llm.GenerateContent(ctx, messagesForLLM,
		llms.WithStreamingFunc(streamingProcessor),
	)
	if err != nil {
		logger.Get().Error().Err(err).Msg("LLM GenerateContent failed after tool call")
		fmt.Printf("\nError from LLM after tool call: %v\n", err)
		return fmt.Errorf("LLM GenerateContent failed after tool call: %w", err)
	}
	fmt.Println()

	// The finalResponse is now populated by the streaming function.
	// We check if any choices were actually added.
	if len(finalResponse.Choices) == 0 {
		logger.Get().Warn().Msg("LLM response was empty after tool call, nothing to save to memory.")
		return nil
	}

	choice := finalResponse.Choices[0]
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

// GenerateResponseNew generates a response from the LLM.
// It returns the content choice, a boolean indicating if the flow was interrupted, and an error.
func GenerateResponseNew(ctx context.Context, llm llmContentGenerator, chatMemory *memory.ConversationBuffer, tools []llms.Tool) (*llms.ContentChoice, bool, error) {
	chatHistMessages, err := chatMemory.ChatHistory.Messages(ctx)
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to get messages from memory for LLM call")
		return nil, false, fmt.Errorf("failed to get messages from memory: %w", err)
	}

	// 2. Convert history to the format required by the LLM
	currentMessagesForLLM := convertMessages(chatHistMessages)

	// 3. Call the LLM with streaming and tools
	// todo)) change the name to agent name
	fmt.Print("AI: ")
	// var llmChatRes string
	// var toolCallCache map[string]*llms.ToolCall

	handler := NewOpenAIFunctionStreamHandler()

	llmResponse, err := llm.GenerateContent(ctx, currentMessagesForLLM,
		llms.WithStreamingFunc(handler.Handle),
		llms.WithTools(tools),
	)
	fmt.Println()

	if err != nil {
		logger.Get().Error().Err(err).Msg("LLM GenerateContent failed")
		return nil, false, fmt.Errorf("LLM GenerateContent failed: %w", err)
	}

	logger.Get().Debug().Msgf("Print the detailed info of llm response: %+v, stop resason: %v", llmResponse, llmResponse.Choices[0].StopReason)

	var toolCalls []llms.ToolCall
	if handler.HasFunctionCall() {
		toolCalls, err = handler.GetToolCalls()
		if err != nil {
			return nil, false, fmt.Errorf("failed to get valid tool calls: %w", err)
		}
	}

	// Check for interruption after processing the stream
	if handler.IsInterrupted() {
		// If interrupted, we don't save the AI message yet, as it's a question.
		// The calling function will handle the interruption.
		// We return the tool calls so the caller can extract the question.
		logger.Get().Info().Msg("Interruption signal 'ask_user_for_input' detected.")
		return &llms.ContentChoice{ToolCalls: toolCalls}, true, nil
	}

	aiMessage := llms.AIChatMessage{Content: handler.FullText, ToolCalls: toolCalls}
	if err := chatMemory.ChatHistory.AddMessage(ctx, aiMessage); err != nil {
		logger.Get().Error().Err(err).Msg("Failed to add AI message to memory")
		// Continue even if saving fails, as we have the response
	}

	return &llms.ContentChoice{Content: aiMessage.Content, ToolCalls: aiMessage.ToolCalls, StopReason: llmResponse.Choices[0].StopReason}, false, nil
}

// GenerateResponse is a reusable function that encapsulates the logic for a single turn of conversation with the LLM.
// Deprecated: This method is deprecated. Use GenerateResponseNew instead for better type safety.
func GenerateResponse(ctx context.Context, llm llmContentGenerator, chatMemory *memory.ConversationBuffer, tools []llms.Tool) (*llms.ContentChoice, error) {
	// 1. Get the current conversation history
	chatHistMessages, err := chatMemory.ChatHistory.Messages(ctx)
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to get messages from memory for LLM call")
		return nil, fmt.Errorf("failed to get messages from memory: %w", err)
	}

	// 2. Convert history to the format required by the LLM
	currentMessagesForLLM := convertMessages(chatHistMessages)

	// 3. Call the LLM with streaming and tools
	fmt.Print("AI: ")
	// Initialize the final response object that the streaming processor will populate.
	// We initialize Choices so we can safely append to Choices[0].
	finalResponse := &llms.ContentResponse{
		Choices: []*llms.ContentChoice{{}},
	}

	// The streaming processor populates the finalResponse object directly.
	streamingProcessor := createStreamingProcessor(finalResponse)
	_, err = llm.GenerateContent(ctx, currentMessagesForLLM,
		llms.WithStreamingFunc(streamingProcessor),
		llms.WithTools(tools),
	)
	fmt.Println()

	if err != nil {
		logger.Get().Error().Err(err).Msg("LLM GenerateContent failed")
		return nil, fmt.Errorf("LLM GenerateContent failed: %w", err)
	}

	// The finalResponse is now populated by the streaming function.
	if len(finalResponse.Choices) == 0 {
		logger.Get().Error().Msg("LLM response was empty")
		return nil, errors.New("LLM returned an empty response")
	}

	// 4. Process and save the response
	choice := finalResponse.Choices[0]
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
		// Continue even if saving fails, as we have the response
	}
	logger.Get().Debug().Msgf("Added AI message to memory. Content: '%s', ToolCalls: %d", choice.Content, len(choice.ToolCalls))

	return choice, nil
}

// convertMessages converts a slice of schema.ChatMessage to a slice of llms.MessageContent.
func convertMessages(messages []llms.ChatMessage) []llms.MessageContent {
	result := make([]llms.MessageContent, len(messages))
	for i, msg := range messages {
		switch msg.GetType() {
		case llms.ChatMessageTypeSystem:
			result[i] = llms.MessageContent{Role: llms.ChatMessageTypeSystem, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		case llms.ChatMessageTypeHuman:
			result[i] = llms.MessageContent{Role: llms.ChatMessageTypeHuman, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		case llms.ChatMessageTypeAI:
			aiMsg, ok := msg.(llms.AIChatMessage)
			if !ok {
				logger.Get().Error().Msgf("Could not cast AI message from history to llms.AIChatMessage: %+v", msg)
				result[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
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
			result[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: parts}
		case llms.ChatMessageTypeTool:
			toolMsg, ok := msg.(llms.ToolChatMessage)
			if !ok {
				logger.Get().Error().Msgf("Could not cast Tool message from history to llms.ToolChatMessage: %+v", msg)
				result[i] = llms.MessageContent{Role: llms.ChatMessageTypeTool, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
				continue
			}
			result[i] = llms.MessageContent{
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
			result[i] = llms.MessageContent{Role: llms.ChatMessageType(msg.GetType()), Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		}
	}
	return result
}

/*
// StartChatCLI starts a command-line interface for the streaming chat application.
// This function is now simplified and primarily for testing purposes.
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

		response, err := GenerateResponse(ctx, llm, chatMemory, MCPTools())
		if err != nil {
			fmt.Printf("\nError from LLM: %v\n", err)
			continue
		}

		if len(response.ToolCalls) > 0 {
			for _, toolCall := range response.ToolCalls {
				if err := HandleToolCallAndRespond(ctx, toolCall, llm, chatMemory); err != nil {
					logger.Get().Error().Err(err).Msgf("Error handling tool call ID %s", toolCall.ID)
					fmt.Printf("Error processing tool call: %v\n", err)
				}
			}
		}
	}
}
*/

// createStreamingProcessor creates a closure that populates a given ContentResponse from a stream.
// It uses a buffer and character-based detection to handle mixed-content streams (text, JSON objects, JSON arrays).
func createStreamingProcessor(finalResponse *llms.ContentResponse) func(ctx context.Context, chunk []byte) error {
	var buffer strings.Builder

	return func(ctx context.Context, chunk []byte) error {
		// 1. Append new chunk to buffer
		buffer.Write(chunk)

		// 2. Trim buffer to check for content
		trimmedBuffer := strings.TrimSpace(buffer.String())

		// 3. If buffer is empty, do nothing
		if trimmedBuffer == "" {
			return nil
		}

		// 4. Judge based on the first character
		switch trimmedBuffer[0] {
		case '{':
			// Attempt to parse as a JSON object (llms.ContentChoice)
			var choice llms.ContentChoice
			err := json.Unmarshal([]byte(trimmedBuffer), &choice)
			if err == nil {
				// Success: process the data
				if choice.Content != "" {
					fmt.Print(choice.Content)
					finalResponse.Choices[0].Content += choice.Content
				}
				if len(choice.ToolCalls) > 0 {
					finalResponse.Choices[0].ToolCalls = append(finalResponse.Choices[0].ToolCalls, choice.ToolCalls...)
					logger.Get().Debug().Msgf("Appended %d tool calls from stream.", len(choice.ToolCalls))
				}
				// Clear buffer after successful processing
				buffer.Reset()
			}

		// If error, it's incomplete JSON. Do nothing and wait for the next chunk.

		case '[':
			// Attempt to parse as a JSON array ([]llms.ToolCall)
			var toolCalls []llms.ToolCall
			err := json.Unmarshal([]byte(trimmedBuffer), &toolCalls)
			if err == nil {
				// Success: process the data
				finalResponse.Choices[0].ToolCalls = append(finalResponse.Choices[0].ToolCalls, toolCalls...)
				logger.Get().Debug().Msgf("Appended %d tool calls from stream.", len(toolCalls))
				// Clear buffer after successful processing
				buffer.Reset()
			}
		// If error, it's incomplete JSON. Do nothing and wait for the next chunk.

		default:
			// Not starting with { or [: treat as plain text
			content := buffer.String()
			fmt.Print(content)
			finalResponse.Choices[0].Content += content
			// Clear buffer after processing
			buffer.Reset()
		}

		return nil
	}
}

// ParseToolArguments is a helper function to safely parse JSON arguments of a tool call.
func ParseToolArguments(args string, v interface{}) error {
	if err := json.Unmarshal([]byte(args), v); err != nil {
		logger.Get().Error().Err(err).Msgf("Failed to parse tool arguments: %s", args)
		return fmt.Errorf("failed to parse tool arguments: %w", err)
	}
	return nil
}
