package mcpclient

import (
	"context"
	"fmt"
	"log"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
)

// HttpClient wraps BaseClient for HTTP-specific MCP communication.
type HttpClient struct {
	*BaseClient // Embedded BaseClient
	// Potentially other httpClient specific fields if any in the future
}

// NewHttpClient creates a new HttpClient instance.
// It initializes a raw streamable HTTP client and then wraps it with BaseClient.
func NewHttpClient(url string) (*HttpClient, error) {
	rawClient, err := client.NewStreamableHttpClient(url)
	if err != nil {
		return nil, fmt.Errorf("failed to create StreamableHTTP client: %w", err)
	}

	// Use NewBaseClient from the same package (or import if it were different)
	base := NewBaseClient(*rawClient)

	return &HttpClient{BaseClient: base}, nil
}

// demonstrateHttpClientUsage shows an example of how to use the HttpClient.
// This function replaces the old createStreamableHTTPClient logic.
func demonstrateHttpClientUsage() {
	// Create HttpClient
	hc, err := NewHttpClient("http://localhost:8080/mcp")
	if err != nil {
		log.Fatalf("Failed to create HttpClient: %v", err)
	}
	defer hc.Close() // This will call BaseClient.Close() via the embedded BaseClient

	ctx := context.Background()

	// Define initRequest for the StreamableHTTPClient Initialize call
	// This remains specific to httpClient.go as it's an HTTP client detail.
	initRequestStreamable := mcp.InitializeRequest{
		Params: mcp.InitializeParams{
			ProtocolVersion: "1.0",
			ClientInfo: mcp.Implementation{
				Name:    "my-streamable-http-client-via-baseclient", // Updated name
				Version: "0.0.2",
			},
			Capabilities: mcp.ClientCapabilities{},
		},
	}

	// Initialize using the method from the embedded BaseClient
	if _, err := hc.Initialize(ctx, initRequestStreamable); err != nil {
		log.Fatalf("HttpClient Initialize failed: %v", err)
	}

	// Define listToolsRequest for StreamableHTTPClient
	// This also remains specific to httpClient.go.
	listToolsRequestStreamable := mcp.ListToolsRequest{} // Default empty request

	// ListTools using the method from the embedded BaseClient
	tools, err := hc.ListTools(ctx, listToolsRequestStreamable)
	if err != nil {
		log.Fatalf("HttpClient ListTools failed: %v", err)
	}

	log.Printf("Available tools via HttpClient: %d", len(tools.Tools))
}
