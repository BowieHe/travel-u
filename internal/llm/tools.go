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

		var toolDetailDescriptions []string
		for _, tool := range tools {
			paramDesc := formatToolParameters(tool)
			toolDetailDescriptions = append(toolDetailDescriptions, fmt.Sprintf("'%s'%s", tool.Name, paramDesc))
		}
		// Use a semicolon to clearly separate tool descriptions.
		clientToolDescriptions = append(clientToolDescriptions, fmt.Sprintf("For client '%s', available operations are: %s", clientName, strings.Join(toolDetailDescriptions, "; ")))
	}

	operationDescription := "The operation (MCP tool name) to call on the target MCP client. "
	if len(clientToolDescriptions) > 0 {
		// Use a newline for better readability in the final prompt.
		operationDescription += "Details per client: " + strings.Join(clientToolDescriptions, ". ")
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

	logger.Get().Debug().Msgf("Get parsed args for tool request: %+v", parsedArgs)
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
		logger.Get().Warn().Msgf("MCP tool '%s' executed with an error flag. Content: %+v", parsedArgs.Operation, result.Content)

		// Parse the structured error and return a human-friendly string.
		errorString, formatErr := formatMCPError(result.Content)
		if formatErr != nil {
			logger.Get().Error().Err(formatErr).Msg("Failed to format MCP error content")
			// Fallback for unparsable errors
			return fmt.Sprintf("Error executing tool %s: received an unparsable error response.", parsedArgs.Operation), nil
		}

		finalErrorMsg := fmt.Sprintf("Error executing tool %s: %s", parsedArgs.Operation, errorString)
		logger.Get().Warn().Msg(finalErrorMsg)
		return finalErrorMsg, nil
	}

	// --- Success Path ---
	if result.Content == nil {
		logger.Get().Info().Msgf("MCP tool '%s' executed successfully but returned no content.", parsedArgs.Operation)
		return "Tool executed successfully with no return data.", nil
	}

	resultBytes, err := json.Marshal(result.Content)
	if err != nil {
		logger.Get().Error().Err(err).Msg("Failed to marshal MCP tool result content")
		return "", fmt.Errorf("failed to marshal MCP tool result content: %w", err)
	}

	// Check for empty JSON objects like {} or null
	if string(resultBytes) == "{}" || string(resultBytes) == "null" {
		logger.Get().Info().Msgf("MCP tool '%s' executed successfully but returned an empty result.", parsedArgs.Operation)
		return "Tool executed successfully with no return data.", nil
	}

	logger.Get().Debug().Msgf("MCP tool '%s' executed successfully. Result: %s", parsedArgs.Operation, string(resultBytes))
	return string(resultBytes), nil
}

// formatToolParameters creates a human-readable description of a tool's parameters.
func formatToolParameters(tool mcp.Tool) string {
	properties := tool.InputSchema.Properties
	if len(properties) == 0 {
		return "" // No parameters defined.
	}

	requiredSet := make(map[string]bool)
	for _, req := range tool.InputSchema.Required {
		requiredSet[req] = true
	}

	var paramDescs []string
	// To ensure a consistent order, we can sort the keys, which is good practice.
	// For now, we'll iterate directly as map iteration order isn't guaranteed.
	for name, prop := range properties {
		propMap, ok := prop.(map[string]any)
		if !ok {
			continue
		}

		propType, _ := propMap["type"].(string)
		var details []string
		details = append(details, fmt.Sprintf("type: %s", propType))

		if requiredSet[name] {
			details = append(details, "required")
		}

		// Check for a description within the parameter schema
		if propDesc, ok := propMap["description"].(string); ok && propDesc != "" {
			details = append(details, fmt.Sprintf("description: '%s'", propDesc))
		}

		// Check for enum values
		if enumVals, ok := propMap["enum"].([]any); ok && len(enumVals) > 0 {
			var enumStrings []string
			for _, v := range enumVals {
				enumStrings = append(enumStrings, fmt.Sprintf("%v", v))
			}
			details = append(details, fmt.Sprintf("enum: [%s]", strings.Join(enumStrings, ", ")))
		}

		desc := fmt.Sprintf("'%s' (%s)", name, strings.Join(details, ", "))
		paramDescs = append(paramDescs, desc)
	}

	if len(paramDescs) == 0 {
		return ""
	}

	return fmt.Sprintf(" which requires parameters: { %s }", strings.Join(paramDescs, ", "))
}

// formatMCPError attempts to parse a structured error from an MCP tool call
// and returns a single, human-readable string.
func formatMCPError(errorData any) (string, error) {
	if errorData == nil {
		return "an unknown error occurred", nil
	}

	// The data is likely a map[string]any or []any representing the JSON.
	// Marshal it to JSON bytes to have a consistent base for unmarshalling.
	errorBytes, err := json.Marshal(errorData)
	if err != nil {
		return "", fmt.Errorf("could not marshal error data from MCP client: %w", err)
	}

	// Case 1: Try to parse as a map of field errors, e.g., {"fromStation": [{"message": "Required"}]}
	// This is a common validation error format.
	var fieldErrors map[string][]struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(errorBytes, &fieldErrors); err == nil && len(fieldErrors) > 0 {
		var errorParts []string
		for field, messages := range fieldErrors {
			if len(messages) > 0 {
				// Just take the first message for simplicity.
				errorParts = append(errorParts, fmt.Sprintf("parameter '%s' has an error (%s)", field, messages[0].Message))
			}
		}
		return strings.Join(errorParts, ", "), nil
	}

	// Case 2: Try to parse as a simple array of errors, e.g., [{"message": "Some error"}]
	var simpleErrors []struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(errorBytes, &simpleErrors); err == nil && len(simpleErrors) > 0 {
		var errorParts []string
		for _, e := range simpleErrors {
			if e.Message != "" {
				errorParts = append(errorParts, e.Message)
			}
		}
		if len(errorParts) > 0 {
			return strings.Join(errorParts, ", "), nil
		}
	}

	// Case 3: The error might just be a simple JSON string.
	var strError string
	if err := json.Unmarshal(errorBytes, &strError); err == nil && strError != "" {
		return strError, nil
	}

	// Fallback: If it's not a recognized format, return the raw JSON.
	// This is better than nothing and helps with debugging.
	return fmt.Sprintf("an unspecified error occurred, details: %s", string(errorBytes)), nil
}
