package mcpclient

import (
	"context"
	"fmt"
	"log"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
)

// HttpClient wraps BaseClient for HTTP-specific MCP communication.
type HttpClient struct {
	*BaseClient // Embedded BaseClient
	// Potentially other httpClient specific fields if any in the future
}

// NewHttpClient creates a new HttpClient instance.
// It initializes a raw streamable HTTP client and then wraps it with BaseClient.
func NewHttpClient(ctx context.Context, url string) (*HttpClient, error) {
	// Use NewBaseClient from the same package (or import if it were different)
	fmt.Println("Initializing HTTP client...")
	// Create HTTP transport
	httpTransport, err := transport.NewStreamableHTTP(url)
	if err != nil {
		log.Fatalf("Failed to create HTTP transport: %v", err)
	}

	// Create client with the transport
	c := client.NewClient(httpTransport)
	base := NewBaseClient(c)

	return &HttpClient{BaseClient: base}, nil
}

func ListTools() {
}
