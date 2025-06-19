package mcpclient

import (
	"context"
	"encoding/json" // Added for JSON marshalling
	"fmt"
	"log"

	// Added for timeout
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
	"github.com/mark3labs/mcp-go/mcp"
)

// HttpClient wraps BaseClient for HTTP-specific MCP communication.
type HttpClient struct {
	*BaseClient // Embedded BaseClient
	// Potentially other httpClient specific fields if any in the future
}

// NewHttpClient creates a new HttpClient instance.
// It initializes a raw streamable HTTP client and then wraps it with BaseClient.
func NewHttpClient(ctx context.Context, url string) (*HttpClient, error) {
	log.Printf("尝试使用 baseURL '%s' 创建 StreamableHTTPClient...", url)
	httpTransport, err := transport.NewStreamableHTTP(url)
	if err != nil {
		log.Printf("创建 StreamableHTTPClient 失败: %v", err)
		return nil, fmt.Errorf("failed to create HTTP transport: %w", err)
	}
	log.Println("StreamableHTTPClient 创建成功.")

	// Create client with the transport
	c := client.NewClient(httpTransport) // This is the raw MCP client

	fmt.Println("Initializing client...")
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    "web-search" + "-client",
		Version: "1.0.0",
	}
	initRequest.Params.Capabilities = mcp.ClientCapabilities{}

	// Start the client
	if err := c.Start(ctx); err != nil {
		log.Fatalf("Failed to start client: %v", err)
	}
	log.Println("successfully start the mcp server")

	initRes, err := c.Initialize(ctx, initRequest)
	if err != nil {
		log.Fatalf("Failed to initialize: %v", err)
	}
	log.Printf("finish init http client: %v ", initRes)

	listToolReq := mcp.ListToolsRequest{}
	c.ListTools(ctx, listToolReq)

	// Set up notification handler (optional, but good to have if server sends notifications)
	c.OnNotification(func(notification mcp.JSONRPCNotification) {
		paramsJSON, err := json.Marshal(notification.Params)
		if err != nil {
			log.Printf("Received notification: Method=%s, Params=(error marshalling: %v)", notification.Method, err)
			return
		}
		log.Printf("Received notification: Method=%s, Params=%s", notification.Method, string(paramsJSON))
	})

	initRequest.Params.Capabilities = mcp.ClientCapabilities{} // No specific client capabilities declared

	// Wrap the initialized c with BaseClient
	base := NewBaseClient(c)

	return &HttpClient{BaseClient: base}, nil
}

// ListTools function seems to be a placeholder or an incorrectly placed method.
// If it's intended to be a method of HttpClient, it should be defined as:
//
//	func (hc *HttpClient) ListTools(ctx context.Context, params mcp.ListToolsRequest) (*mcp.ListToolsResponse, error) {
//	    return hc.RawClient.ListTools(ctx, params)
//	}
//
// For now, I'll leave the standalone function as is, assuming it might be used elsewhere or is a remnant.
func ListTools() {
	// This function is currently empty and not directly related to NewHttpClient.
	// If it's meant to be part of the client's functionality, it should be a method on *HttpClient.
}
