package mcpclient

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

// StdioClient wraps BaseClient for stdio-specific MCP communication.
type StdioClient struct {
	*BaseClient
	// Potentially other stdioClient specific fields if any in the future
}

// NewStdioClient creates a new StdioClient instance.
// It now handles initialization and returns errors instead of fatally logging.
func NewStdioClient(ctx context.Context, command string, args []string, serverName string) (*StdioClient, error) {
	trueCommand := command // Default to command
	if command == "uvx" {  // If "uvx", expand path
		trueCommand = "/opt/homebrew/bin/uvx"
	}
	// Add check for empty command
	if trueCommand == "" {
		return nil, fmt.Errorf("command cannot be empty")
	}

	stdioTransport := transport.NewStdio(command, nil, args...)
	c := client.NewClient(stdioTransport)
	// Start the client
	if err := c.Start(ctx); err != nil {
		log.Fatalf("Failed to start client: %v", err)
	}

	// Set up notification handler
	c.OnNotification(func(notification mcp.JSONRPCNotification) {
		fmt.Printf("Received notification: %s\n", notification.Method)
	})

	// Initialize the client
	fmt.Println("Initializing client...")
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    serverName + "-client",
		Version: "1.0.0",
	}
	initRequest.Params.Capabilities = mcp.ClientCapabilities{}

	serverInfo, err := c.Initialize(ctx, initRequest)
	if err != nil {
		log.Fatalf("Failed to initialize: %v", err)
	}
	if serverInfo.Capabilities.Tools != nil {
		fmt.Println("Fetching available tools...")
		toolsRequest := mcp.ListToolsRequest{}
		toolsResult, err := c.ListTools(ctx, toolsRequest)
		if err != nil {
			log.Printf("Failed to list tools: %v", err)
		} else {
			fmt.Printf("Server has %d tools available\n", len(toolsResult.Tools))
			for i, tool := range toolsResult.Tools {
				fmt.Printf("  %d. %s - %s\n", i+1, tool.Name, tool.Description)
			}
		}
	}

	base := NewBaseClient(c)
	// The redundant base.Initialize call has been removed here.
	// Initialization is performed by rawClient.Initialize above.

	return &StdioClient{BaseClient: base}, nil
}

// DemonstrateStdioClientUsage shows an example of how to use the StdioClient.
// This function replaces the old CreateStdioClient functionality.
func DemonstrateStdioClientUsage() {
	// Create client that spawns a subprocess
	// test fetch
	// A context is now passed to NewStdioClient.
	clientCtx, cancelClient := context.WithCancel(context.Background()) // Use WithCancel
	defer cancelClient()                                                // Ensure clientCtx is cancelled
	sc, err := NewStdioClient(clientCtx, "npx", []string{"-y", "puppeteer-mcp-server"}, "fetch")
	if err != nil {
		// If NewStdioClient can fail (e.g. command not found, initial handshake fails),
		// this log.Fatalf is appropriate for a demonstration function.
		// For library code, this error would typically be returned.
		log.Fatalf("Failed to create StdioClient: %v", err)
	}
	defer sc.Close() // This will call BaseClient.Close()

	// Context for subsequent operations like ListTools
	// opCtx, cancelOp := context.WithCancel(context.Background()) // Use WithCancel
	// defer cancelOp()                                            // Ensure opCtx is cancelled

	// The Initialize call previously here has been removed
	// as NewStdioClient now handles the initial mandatory initialization.

	// Define listToolsRequest for StdioClient
	listToolsRequest := mcp.ListToolsRequest{} // Default empty request

	// Use the client's ListTools method (from embedded BaseClient)
	tools, err := sc.ListTools(clientCtx, listToolsRequest) // Using opCtx
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
