package mcpclient

import (
	"context"
	"encoding/json"
	"fmt" // Added for error formatting
	"log"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp" // Added for mcp.InitializeRequest and related types
)

// StdioClient wraps BaseClient for stdio-specific MCP communication.
type StdioClient struct {
	*BaseClient
	// Potentially other stdioClient specific fields if any in the future
}

// NewStdioClient creates a new StdioClient instance.
func NewStdioClient(command string, args []string, serverName string) (*StdioClient, error) {
	rawClient, err := client.NewStdioMCPClient(command, args, serverName)
	if err != nil {
		return nil, fmt.Errorf("failed to create StdioMCP client: %w", err)
	}

	base := NewBaseClient(*rawClient) // Corrected based on compiler error: rawClient is *client.Client, NewBaseClient expects client.Client

	return &StdioClient{BaseClient: base}, nil
}

// DemonstrateStdioClientUsage shows an example of how to use the StdioClient.
// This function replaces the old CreateStdioClient functionality.
func DemonstrateStdioClientUsage() {
	// Create client that spawns a subprocess
	// test fetch
	sc, err := NewStdioClient(
		"/opt/homebrew/bin/uvx", []string{}, "mcp-server-fetch",
	)
	if err != nil {
		log.Fatalf("Failed to create StdioClient: %v", err)
	}
	defer sc.Close() // This will call BaseClient.Close()

	ctx := context.Background()

	// Define initRequest for the Initialize call
	// This remains specific to stdioClient or its usage context
	initRequest := mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ProtocolVersion: "1.0",
			ClientInfo: mcp.Implementation{
				Name:    "my-stdio-client-via-base", // Updated client name
				Version: "0.0.2",                    // Updated client version
			},
			Capabilities: mcp.ClientCapabilities{},
		},
	}

	// Initialize connection using the embedded BaseClient's method
	if _, err := sc.Initialize(ctx, initRequest); err != nil {
		log.Fatalf("Initialize failed: %v", err)
	}

	// Define listToolsRequest for StdioClient
	// This remains specific to stdioClient or its usage context
	listToolsRequest := mcp.ListToolsRequest{} // Default empty request

	// Use the client's ListTools method (from embedded BaseClient)
	tools, err := sc.ListTools(ctx, listToolsRequest)
	if err != nil {
		log.Fatalf("ListTools failed: %v", err)
	}

	log.Printf("Available tools: %d", len(tools.Tools))

	// Keep specific logic like pretty printing JSON
	prettyJSON, err := json.MarshalIndent(tools, "", "  ")
	if err != nil {
		log.Fatalf("JSON marshal error: %v", err)
	}
	log.Printf("User (pretty JSON):\n%s", prettyJSON)
}
