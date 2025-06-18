package mcpclient

import (
	"context"
	"fmt"
	"log"

	localmcp "github.com/BowieHe/travel-u/pkg/mcp"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
)

// BaseClient defines a generic MCP client base structure.
type BaseClient struct {
	mcpClient *client.Client
}

// MCPClient defines the interface for MCP client implementations.
type MCPClient interface {
	Initialize(ctx context.Context, params mcp.InitializeRequest) (*mcp.InitializeResult, error)
	ListTools(ctx context.Context, params mcp.ListToolsRequest) (*mcp.ListToolsResult, error)
	Close() error
	// ExecuteTool(ctx context.Context, params mcp.ExecuteToolRequest) (*mcp.ExecuteToolResult, error) // Example, add if common
}

// NewBaseClient creates a new instance of BaseClient.
func NewBaseClient(mcpClient *client.Client) *BaseClient {
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

// NewMCPClientFromConfig creates a new MCPClient based on the server configuration.
func NewMCPClientFromConfig(ctx context.Context, serverConfig localmcp.MCPServer) (MCPClient, error) {
	if serverConfig.Type == nil {
		return nil, fmt.Errorf("MCP server type is missing for server: %s", serverConfig.Name)
	}

	log.Printf("Create client with type: %v", *serverConfig.Type)
	switch *serverConfig.Type {
	case "stdio":
		if serverConfig.Command == nil {
			return nil, fmt.Errorf("command is missing for stdio server: %s", serverConfig.Name)
		}
		// Note: NewStdioClient expects serverName as the third argument.
		// We'll use serverConfig.Name for this.
		return NewStdioClient(ctx, *serverConfig.Command, serverConfig.Args, serverConfig.Name)
	case "streamableHttp":
		if serverConfig.BaseURL == nil {
			return nil, fmt.Errorf("baseURL is missing for streamableHttp server: %s", serverConfig.Name)
		}
		return NewHttpClient(ctx, *serverConfig.BaseURL)
	default:
		return nil, fmt.Errorf("unsupported MCP server type: %s for server: %s", *serverConfig.Type, serverConfig.Name)
	}
}
