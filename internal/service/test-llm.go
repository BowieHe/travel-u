package service

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/BowieHe/travel-u/pkg/model"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/tmc/langchaingo/chains" // Keep for Testllm
	"github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/llms/openai"
	"github.com/tmc/langchaingo/memory"

	"github.com/mark3labs/mcp-go/mcp"
)

func mcptools() []llms.Tool {
	registeredClientNames := GetRegisteredClientNames() // From internal/service/mcp.go
	var clientToolDescriptions []string

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second) // Timeout for listing tools
	defer cancel()

	for _, clientName := range registeredClientNames {
		mcpClient, found := GetClient(clientName) // From internal/service/mcp.go
		if !found {
			logger.Get().Warn().Msgf("mcptools: Client '%s' not found in registry while building tool list.", clientName)
			continue
		}

		tools, err := mcpClient.ListTools(ctx)
		if err != nil {
			logger.Get().Error().Err(err).Msgf("mcptools: Failed to list tools for MCP client '%s'", clientName)
			clientToolDescriptions = append(clientToolDescriptions, fmt.Sprintf("For client '%s': (could not list tools - %v)", clientName, err))
			continue
		}

		if len(tools) == 0 {
			clientToolDescriptions = append(clientToolDescriptions, fmt.Sprintf("For client '%s': No tools listed.", clientName))
			continue
		}

		var toolNames []string
		for _, tool := range tools {
			toolNames = append(toolNames, "'"+tool.Name+"'")
		}
		clientToolDescriptions = append(clientToolDescriptions, fmt.Sprintf("For client '%s', available operations (tools) are: %s.", clientName, strings.Join(toolNames, ", ")))
	}

	operationDescription := "The operation (MCP tool name) to call on the target MCP client. "
	if len(clientToolDescriptions) > 0 {
		operationDescription += strings.Join(clientToolDescriptions, " ")
	} else {
		operationDescription += "No MCP clients or tools seem to be available."
	}

	clientEnumDescription := "The name of the MCP client/resource to target."
	if len(registeredClientNames) > 0 {
		clientEnumDescription += " Available clients: " + strings.Join(registeredClientNames, ", ")
	}

	return []llms.Tool{
		{
			Type: "function",
			Function: &llms.FunctionDefinition{
				Name:        "mcp_query",
				Description: "Query an MCP (Mark3Labs Control Protocol) client. Use this to interact with external services or data sources configured via MCP.",
				Parameters: map[string]any{
					"type": "object",
					"properties": map[string]any{
						"operation": map[string]any{
							"type":        "string",
							"description": operationDescription, // Dynamically generated
						},
						"resource": map[string]any{
							"type":        "string",
							"description": clientEnumDescription, // Lists available client names
							// "enum": registeredClientNames, // Optionally use enum if list is stable
						},
						"params": map[string]any{
							"type":                 "object",
							"description":          "A JSON object containing the arguments for the MCP operation. Can be an empty object if not needed.",
							"additionalProperties": true,
						},
					},
					"required": []string{"operation", "resource"},
				},
			},
		},
	}
}

func executeMCPTool(ctx context.Context, llmToolName string, argumentsJSON string) (string, error) {
	if llmToolName != "mcp_query" {
		return "", fmt.Errorf("unsupported LLM tool: %s", llmToolName)
	}

	logger.Get().Info().Msgf("Executing MCP tool: %s with args: %s", llmToolName, argumentsJSON)

	var parsedArgs struct {
		Operation   string                 `json:"operation"`
		Resource    string                 `json:"resource"` // This is the MCP client name
		QueryParams map[string]interface{} `json:"params"`
	}

	if err := json.Unmarshal([]byte(argumentsJSON), &parsedArgs); err != nil {
		return "", fmt.Errorf("invalid arguments JSON for %s: %w", llmToolName, err)
	}

	if parsedArgs.Resource == "" {
		return "", fmt.Errorf("MCP client name ('resource' field in tool arguments) is required")
	}
	if parsedArgs.Operation == "" {
		return "", fmt.Errorf("'operation' field in tool arguments is required")
	}

	// Assuming GetClient is in the same package 'service'
	mcpClient, found := GetClient(parsedArgs.Resource)
	if !found {
		return "", fmt.Errorf("MCP client not found: %s", parsedArgs.Resource)
	}

	request := mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Name:      parsedArgs.Operation,
			Arguments: parsedArgs.QueryParams,
		},
	}

	callCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	logger.Get().Info().Msgf("Calling MCP client '%s' tool '%s' with params: %+v", parsedArgs.Resource, parsedArgs.Operation, parsedArgs.QueryParams)
	result, err := mcpClient.CallTool(callCtx, request)
	if err != nil {
		logger.Get().Error().Err(err).Msgf("MCP client.CallTool failed for client %s, operation %s", parsedArgs.Resource, parsedArgs.Operation)
		return "", fmt.Errorf("MCP client.CallTool for '%s' operation '%s' failed: %w", parsedArgs.Resource, parsedArgs.Operation, err)
	}

	// Check if the tool call resulted in an error reported by the tool itself.
	if result.IsError {
		logger.Get().Warn().Msgf("MCP tool '%s' executed with an error flag.", parsedArgs.Operation)
		// Even with an error, we might have content. We'll marshal whatever is there.
	}

	// Check if the content slice is empty. This is the most reliable way to see if nothing was returned.
	if len(result.Content) == 0 {
		logger.Get().Info().Msgf("MCP tool '%s' executed successfully but returned no content.", parsedArgs.Operation)
		// Return a structured message indicating no data was returned.
		return `{"status": "success", "content": "Tool executed but returned no data."}`, nil
	}

	// The result to be returned to the LLM should be the content of the tool call.
	// The LLM expects the content part, not the entire CallToolResult structure.
	resultBytes, err := json.Marshal(result.Content)
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to marshal MCP tool result content")
		return "", fmt.Errorf("failed to marshal MCP tool result content: %w", err)
	}

	// Handle cases where the result is an empty JSON object
	if string(resultBytes) == "{}" || string(resultBytes) == "null" {
		logger.Get().Info().Msgf("MCP tool '%s' executed successfully but returned an empty result.", parsedArgs.Operation)
		return `{"status": "success", "content": "Tool executed but returned no data."}`, nil
	}

	logger.Get().Debug().Msgf("MCP tool '%s' executed successfully. Result: %s", parsedArgs.Operation, string(resultBytes))
	return string(resultBytes), nil
}

func handleToolCallAndRespond(ctx context.Context, toolCall llms.ToolCall, llm *openai.LLM, chatMemory *memory.ConversationBuffer) error {
	if toolCall.FunctionCall == nil {
		logger.Get().Error().Msg("ToolCall received with nil FunctionCall")
		return errors.New("nil FunctionCall in toolCall")
	}

	logger.Get().Info().Msgf("LLM requests tool call. ID: %s, Name: %s, Args: %s",
		toolCall.ID, toolCall.FunctionCall.Name, toolCall.FunctionCall.Arguments)

	toolResultContent, err := executeMCPTool(ctx, toolCall.FunctionCall.Name, toolCall.FunctionCall.Arguments)
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
		case llms.ChatMessageTypeSystem: // Updated to use schema.ChatMessageTypeSystem and llms.Text
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeSystem, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		case llms.ChatMessageTypeHuman: // Updated to use schema.ChatMessageTypeHuman and llms.Text
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeHuman, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		case llms.ChatMessageTypeAI: // Updated to use schema.ChatMessageTypeAI
			// This is an AI message. It might be a simple text response,
			// OR it might be the AI message that *requested* the tool calls.
			aiMsg, ok := msg.(llms.AIChatMessage) // Attempt to cast to the specific type from memory
			if !ok {
				logger.Get().Error().Msgf("Could not cast AI message from history to llms.AIChatMessage: %+v", msg)
				// Fallback to simple text content if cast fails
				messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
				continue
			}

			parts := []llms.ContentPart{llms.TextContent{Text: aiMsg.Content}} // Start with text content

			// If this AI message had tool calls, they need to be part of the llms.MessageContent
			if len(aiMsg.ToolCalls) > 0 {
				for _, tc := range aiMsg.ToolCalls {
					parts = append(parts, llms.ToolCall{ // This is llms.ToolCall, not ToolCallResponse
						ID:   tc.ID,
						Type: tc.Type, // Should be "function"
						FunctionCall: &llms.FunctionCall{ // Ensure FunctionCall is a pointer
							Name:      tc.FunctionCall.Name,
							Arguments: tc.FunctionCall.Arguments,
						},
					})
				}
			}
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeAI, Parts: parts}

		case llms.ChatMessageTypeTool: // Updated to use schema.ChatMessageTypeTool
			toolMsg, ok := msg.(llms.ToolChatMessage)
			if !ok {
				logger.Get().Error().Msgf("Could not cast Tool message from history to llms.ToolChatMessage: %+v", msg)
				messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageTypeTool, Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}} // Fallback
				continue
			}
			// The 'Name' in ToolCallResponse should be the name of the function that was called.
			// This 'toolCall' is the specific one being handled by this invocation of handleToolCallAndRespond.
			messagesForLLM[i] = llms.MessageContent{
				Role: llms.ChatMessageTypeTool,
				Parts: []llms.ContentPart{
					llms.ToolCallResponse{
						ToolCallID: toolMsg.ID,                 // ID from the stored ToolChatMessage
						Name:       toolCall.FunctionCall.Name, // Name of the function this response is for
						Content:    toolMsg.Content,
					},
				},
			}
		default:
			logger.Get().Warn().Msgf("Unhandled chat message type in history for LLM conversion: %s", msg.GetType())
			messagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageType(msg.GetType()), Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
		}
	}

	// debug only
	// fmt.Print("\nAI (after tool call): ")
	var finalResponseBuilder strings.Builder
	_, err = llm.GenerateContent(ctx, messagesForLLM,
		llms.WithStreamingFunc(func(ctx context.Context, chunk []byte) error {
			// fmt.Print(string(chunk))
			finalResponseBuilder.Write(chunk)
			return nil
		}),
		llms.WithTools(mcptools()),
	)
	if err != nil {
		logger.Get().Error().Err(err).Msg("LLM GenerateContent failed after tool call")
		fmt.Printf("\nError from LLM after tool call: %v\n", err)
		return fmt.Errorf("LLM GenerateContent failed after tool call: %w", err)
	}
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

func Testllm() {
	llm, err := model.GetOpenAI(types.LLMOption{})
	if err != nil {
		logger.Get().Fatal().Err(err).Msg("Failed to get OpenAI LLM for Testllm")
		return
	}

	chatMemory := memory.NewConversationBuffer()

	// Create conversation chain
	chain := chains.NewConversation(llm, chatMemory)

	fmt.Println("Chat Application Started! Type 'quit' to exit.")

	scanner := bufio.NewScanner(os.Stdin)
	ctx := context.Background()

	for {
		fmt.Print("You: ")
		if !scanner.Scan() {
			break
		}

		input := strings.TrimSpace(scanner.Text())
		if input == "quit" {
			break
		}

		// Use chain for stateful conversation
		result, err := chains.Run(ctx, chain, input)
		if err != nil {
			fmt.Printf("Error: %v\n", err)
			continue
		}

		fmt.Printf("AI: %s\n\n", result)
	}
}

func TestllmStreaming() {
	llm, err := model.GetOpenAI(types.LLMOption{})
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to get OpenAI LLM for TestllmStreaming")
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
			break
		}
		if userInput == "" {
			continue
		}

		// Add user message to memory
		if err := chatMemory.ChatHistory.AddMessage(ctx, llms.HumanChatMessage{Content: userInput}); err != nil {
			logger.Get().Error().Err(err).Msg("Failed to add user message to memory")
			continue
		}

		chatHistMessages, err := chatMemory.ChatHistory.Messages(ctx)
		if err != nil {
			logger.Get().Error().Err(err).Msg("Failed to get messages from memory for LLM call")
			continue
		}

		// Correctly reconstruct message history for the LLM call
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
				// The key is to send a `ToolCallResponse` part, not just text.
				currentMessagesForLLM[i] = llms.MessageContent{
					Role: llms.ChatMessageTypeTool,
					Parts: []llms.ContentPart{
						llms.ToolCallResponse{
							ToolCallID: toolMsg.ID,
							// Name is not easily available here, but the ID is the crucial part.
							Content: toolMsg.Content,
						},
					},
				}
			default:
				logger.Get().Warn().Msgf("Unhandled chat message type in history for LLM conversion: %s", msg.GetType())
				currentMessagesForLLM[i] = llms.MessageContent{Role: llms.ChatMessageType(msg.GetType()), Parts: []llms.ContentPart{llms.TextContent{Text: msg.GetContent()}}}
			}
		}

		// debug only
		// fmt.Print("AI: ")
		var streamedContentBuilder strings.Builder
		llmResponse, err := llm.GenerateContent(ctx, currentMessagesForLLM,
			llms.WithStreamingFunc(func(ctx context.Context, chunk []byte) error {
				// fmt.Print(string(chunk))
				streamedContentBuilder.Write(chunk)
				return nil
			}),
			llms.WithTools(mcptools()), // IMPORTANT: Pass the MCP tools to the LLM
		)
		fmt.Println() // Newline after streaming AI response or tool call indication

		if err != nil {
			logger.Get().Error().Err(err).Msg("LLM GenerateContent failed")
			fmt.Printf("Error from LLM: %v\n", err)
			continue
		}

		// Check for tool calls
		if len(llmResponse.Choices) > 0 && len(llmResponse.Choices[0].ToolCalls) > 0 {
			// LLM wants to make tool calls

			// 1. Construct the AI message that contained the tool call requests.
			// The content of this message might be empty if the LLM only decided to call tools.
			// Or it might have some preliminary text. The streamedContentBuilder has this.
			// The crucial part is that this message will be associated with the ToolCalls.
			aiMessageWithToolCallRequests := llms.AIChatMessage{
				Content:   streamedContentBuilder.String(), // Content streamed *before* tool call decision
				ToolCalls: llmResponse.Choices[0].ToolCalls,
			}

			// 2. Add this AI message to chat memory.
			if err := chatMemory.ChatHistory.AddMessage(ctx, aiMessageWithToolCallRequests); err != nil {
				logger.Get().Error().Err(err).Msg("Failed to add AI message (with tool call requests) to memory")
				// Decide how to handle this error, perhaps continue to next user input
				continue
			}
			// logger.Get().Debug().Msgf("Added AI message with tool call requests to memory. Content: '%s', ToolCalls: %d", aiMessageWithToolCallRequests.Content, len(aiMessageWithToolCallRequests.ToolCalls))

			// 3. Now, iterate and handle each tool call.
			for _, toolCall := range llmResponse.Choices[0].ToolCalls {
				// The handleToolCallAndRespond function will add the ToolChatMessage (result)
				// and then call the LLM again.
				if err := handleToolCallAndRespond(ctx, toolCall, llm, chatMemory); err != nil {
					logger.Get().Error().Err(err).Msgf("Error handling tool call ID %s", toolCall.ID)
					fmt.Printf("Error processing tool call: %v\n", err)
					// Potentially add an error message to chat memory or break
				}
			}
		} else {
			// No tool calls, just a regular AI response
			aiResponseContent := streamedContentBuilder.String()
			// Fallback if streaming was empty but choices[0].Content has data (less common with streaming)
			if aiResponseContent == "" && len(llmResponse.Choices) > 0 && llmResponse.Choices[0].Content != "" {
				aiResponseContent = llmResponse.Choices[0].Content
			}

			if err := chatMemory.ChatHistory.AddMessage(ctx, llms.AIChatMessage{Content: aiResponseContent}); err != nil {
				logger.Get().Error().Err(err).Msg("Failed to add AI message (no tool calls) to memory")
			} else {
				logger.Get().Debug().Msgf("Added AI response (no tool calls) to memory: %s", aiResponseContent)
			}
		}
	}
}
