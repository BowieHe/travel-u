package mcpclient

import (
	"context"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
)

// BaseClient defines a generic MCP client base structure.
type BaseClient struct {
	mcpClient client.Client
}

// NewBaseClient creates a new instance of BaseClient.
func NewBaseClient(mcpClient client.Client) *BaseClient {
	return &BaseClient{
		mcpClient: mcpClient,
	}
}

// Initialize calls the Initialize method of the underlying mcpClient.
func (bc *BaseClient) Initialize(ctx context.Context, params mcp.InitializeRequest) (*mcp.InitializeResult, error) {
	return bc.mcpClient.Initialize(ctx, params)
}

// ListTools calls the ListTools method of the underlying mcpClient.
func (bc *BaseClient) ListTools(ctx context.Context, params mcp.ListToolsRequest) (*mcp.ListToolsResult, error) {
	return bc.mcpClient.ListTools(ctx, params)
}

// Close calls the Close method of the underlying mcpClient.
func (bc *BaseClient) Close() error {
	return bc.mcpClient.Close()
}
