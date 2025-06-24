package llm

import (
	"bufio"
	"bytes"
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
	_, err = llm.GenerateContent(ctx, messagesForLLM,
		llms.WithStreamingFunc(streamingProcessor),
		// Note: We don't provide tools here again, as the goal is to get a final summary.
		// If the model were to call a tool again, it could lead to loops.
	)
	if err != nil {
		logger.Get().Error().Err(err).Msg("LLM GenerateContent failed after tool call")
		fmt.Printf("\nError from LLM after tool call: %v\n", err)
		return fmt.Errorf("LLM GenerateContent failed after tool call: %w", err)
	}
	// The streaming processor now handles all output and accumulation.
	// The debug block is no longer necessary.
	fmt.Println()

	finalAIResponse := finalResponseBuilder.String()
	aiMsg := llms.AIChatMessage{Content: finalAIResponse}
	if err := chatMemory.ChatHistory.AddMessage(ctx, aiMsg); err != nil {
		logger.Get().Error().Err(err).Msg("Failed to add final AI response to chat memory")
		return fmt.Errorf("failed to add final AI response to memory: %w", err)
	}
	logger.Get().Debug().Msgf("Added final AI response to memory: %s", finalAIResponse)
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
			// break
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

		// --- Start of Debug Block ---
		// Marshal the response to JSON to properly inspect its contents, especially slices of pointers.
		// todo)) delete, for debug output only
		if llmResponse != nil && len(llmResponse.Choices) > 0 {
			// Create a serializable representation to see the full content.
			// We dereference the pointers from the Choices slice.
			serializableChoices := make([]llms.ContentChoice, 0, len(llmResponse.Choices))
			for _, choicePtr := range llmResponse.Choices {
				if choicePtr != nil {
					serializableChoices = append(serializableChoices, *choicePtr)
				}
			}
			debugOutput := struct {
				Choices []llms.ContentChoice `json:"choices"`
			}{
				Choices: serializableChoices,
			}

			jsonData, err := json.MarshalIndent(debugOutput, "", "  ")
			if err != nil {
				fmt.Println("Error marshaling llmResponse for debugging:", err)
			} else {
				fmt.Println("--- Full LLM Response ---")
				fmt.Println(string(jsonData))
				fmt.Println("-------------------------")
			}
		}
		// --- End of Debug Block ---
		if len(llmResponse.Choices) == 0 {
			logger.Get().Error().Msg("LLM response was empty")
			fmt.Println("LLM returned an empty response.")
			continue
		}

		choice := llmResponse.Choices[0]

		// After the content stream is finished, print the reasoning content if it exists.
		if choice.ReasoningContent != "" {
			fmt.Printf("\n[思考中]... %s\n", choice.ReasoningContent)
		}

		// Add the complete AI message (with content and any tool calls) to history.
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

		// If there are tool calls, execute them.
		if len(choice.ToolCalls) > 0 {
			// The introductory message (if any) has already been streamed.
			// Now we execute the tools.
			for _, toolCall := range choice.ToolCalls {
				if err := HandleToolCallAndRespond(ctx, toolCall, llm, chatMemory); err != nil { // Note: llm is passed through
					logger.Get().Error().Err(err).Msgf("Error handling tool call ID %s", toolCall.ID)
					fmt.Printf("Error processing tool call: %v\n", err)
				}
			}
		}
		// If there are no tool calls, the interaction for this turn is complete.
		// The response has already been streamed and saved to history.
	}
}

// createStreamingProcessor creates a closure that handles streaming content.
// It attempts to decode each chunk as a ContentChoice. If it fails, it assumes
// the chunk is a raw string and prints it. This handles both text and the
// fragmented JSON that can appear in tool call streams.
func createStreamingProcessor(contentBuilder *strings.Builder) func(ctx context.Context, chunk []byte) error {
	// buffer is used to accumulate partial JSON from chunks.
	var buffer bytes.Buffer

	return func(ctx context.Context, chunk []byte) error {
		var choice llms.ContentChoice
		// First, try to unmarshal the chunk directly.
		// This will succeed for chunks that are complete JSON objects (like content updates).
		if err := json.Unmarshal(chunk, &choice); err == nil {
			if choice.Content != "" {
				fmt.Print(choice.Content)
				contentBuilder.WriteString(choice.Content)
			}
			// If there's a thought, print it.
			if choice.ReasoningContent != "" {
				fmt.Printf("\n[思考中]... %s\n", choice.ReasoningContent)
			}
			// We don't handle tool calls here because we get the complete list
			// from the final GenerateContent response.
			return nil
		}

		// If direct unmarshaling fails, it could be a text fragment or a piece of a larger JSON object.
		// We append to a buffer to try to form a complete object.
		buffer.Write(chunk)

		// Try to decode the accumulated buffer.
		decoder := json.NewDecoder(bytes.NewReader(buffer.Bytes()))
		if err := decoder.Decode(&choice); err == nil {
			// Success! We formed a complete JSON object.
			if choice.Content != "" {
				fmt.Print(choice.Content)
				contentBuilder.WriteString(choice.Content)
			}
			if choice.ReasoningContent != "" {
				fmt.Printf("\n[思考中]... %s\n", choice.ReasoningContent)
			}
			// Clear the buffer since we've successfully processed it.
			buffer.Reset()
			return nil
		}

		// If we're here, the chunk is likely a raw piece of text or an incomplete JSON fragment.
		// For the best user experience, we print it immediately.
		// This handles the case where tool call arguments are streamed in fragments.
		// While this might print JSON fragments, it's better than silence.
		// The final, correct tool call data is retrieved from the llmResponse object later.
		// A small check to avoid printing raw JSON brackets if possible.
		trimmedChunk := bytes.TrimSpace(chunk)
		if !(bytes.HasPrefix(trimmedChunk, []byte("[")) && bytes.HasSuffix(trimmedChunk, []byte("]"))) &&
			!(bytes.HasPrefix(trimmedChunk, []byte("{")) && bytes.HasSuffix(trimmedChunk, []byte("}"))) {
			fmt.Print(string(chunk))
		}

		// We still append to the content builder, as it might be part of the final textual response.
		contentBuilder.Write(chunk)

		return nil
	}
}
