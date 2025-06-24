package llm

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/BowieHe/travel-u/internal/service"
	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/mark3labs/mcp-go/mcp"
	"github.com/tmc/langchaingo/llms"
)

// MCPTools generates a list of LLM tools based on registered MCP clients.
func MCPTools() []llms.Tool {
	registeredClientNames := service.GetRegisteredClientNames() // From internal/service
	var clientToolDescriptions []string

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second) // Timeout for listing tools
	defer cancel()

	for _, clientName := range registeredClientNames {
		mcpClient, found := service.GetClient(clientName) // From internal/service
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

// ExecuteMCPTool handles the execution of an MCP tool call from the LLM.
// It's a variable to allow for easy mocking in tests.
var ExecuteMCPTool = func(ctx context.Context, llmToolName string, argumentsJSON string) (string, error) {
	if llmToolName != "mcp_query" {
		return "", fmt.Errorf("unsupported LLM tool: %s", llmToolName)
	}

	logger.Get().Debug().Msgf("Executing MCP tool: %s with args: %s", llmToolName, argumentsJSON)

	var parsedArgs struct {
		Operation   string         `json:"operation"`
		Resource    string         `json:"resource"` // This is the MCP client name
		QueryParams map[string]any `json:"params"`
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

	mcpClient, found := service.GetClient(parsedArgs.Resource)
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

	logger.Get().Debug().Msgf("Calling MCP client '%s' tool '%s' with params: %+v", parsedArgs.Resource, parsedArgs.Operation, parsedArgs.QueryParams)
	result, err := mcpClient.CallTool(callCtx, request)
	if err != nil {
		logger.Get().Error().Err(err).Msgf("MCP client.CallTool failed for client %s, operation %s", parsedArgs.Resource, parsedArgs.Operation)
		return "", fmt.Errorf("MCP client.CallTool for '%s' operation '%s' failed: %w", parsedArgs.Resource, parsedArgs.Operation, err)
	}

	if result.IsError {
		logger.Get().Warn().Msgf("MCP tool '%s' executed with an error flag.", parsedArgs.Operation)
	}

	if len(result.Content) == 0 {
		logger.Get().Info().Msgf("MCP tool '%s' executed successfully but returned no content.", parsedArgs.Operation)
		return `{"status": "success", "content": "Tool executed but returned no data."}`, nil
	}

	resultBytes, err := json.Marshal(result.Content)
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to marshal MCP tool result content")
		return "", fmt.Errorf("failed to marshal MCP tool result content: %w", err)
	}

	if string(resultBytes) == "{}" || string(resultBytes) == "null" {
		logger.Get().Info().Msgf("MCP tool '%s' executed successfully but returned an empty result.", parsedArgs.Operation)
		return `{"status": "success", "content": "Tool executed but returned no data."}`, nil
	}

	logger.Get().Debug().Msgf("MCP tool '%s' executed successfully. Result: %s", parsedArgs.Operation, string(resultBytes))
	return string(resultBytes), nil
}
