package service

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sync"

	"github.com/BowieHe/travel-u/pkg/logger"
	mcpclient "github.com/BowieHe/travel-u/pkg/mcp-client"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/mark3labs/mcp-go/mcp"
)

// RegisteredMCPClient defines the interface for registered MCP clients.
type RegisteredMCPClient interface {
	CallTool(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error)
	Subscribe(ctx context.Context) (<-chan mcp.Notification, error) // Matches ResilientClient's Subscribe
	ListTools(ctx context.Context) ([]mcp.Tool, error)              // New method
	Close() error
	// Add other methods if needed by executeMCPTool, like GetName() if useful
}

var (
	clientRegistry      = make(map[string]RegisteredMCPClient)
	clientRegistryMutex = sync.RWMutex{} // For concurrent-safe access
)

// RegisterClient adds a client to the registry.
func RegisterClient(name string, client RegisteredMCPClient) {
	clientRegistryMutex.Lock()
	defer clientRegistryMutex.Unlock()
	clientRegistry[name] = client
	logger.Get().Debug().Msgf("Registered MCP client: %s", name)
}

// GetClient retrieves a client from the registry.
func GetClient(name string) (RegisteredMCPClient, bool) {
	clientRegistryMutex.RLock()
	defer clientRegistryMutex.RUnlock()
	client, found := clientRegistry[name]
	return client, found
}

// GetRegisteredClientNames returns a slice of registered client names.
func GetRegisteredClientNames() []string {
	clientRegistryMutex.RLock()
	defer clientRegistryMutex.RUnlock()
	names := make([]string, 0, len(clientRegistry))
	for name := range clientRegistry {
		names = append(names, name)
	}
	return names
}

// InitializeMCPClients initializes MCP clients from a configuration file.
func InitializeMCPClients(configFile string) error {
	logger.Get().Info().Msgf("Initializing MCP clients from config: %s", configFile)
	data, err := os.ReadFile(configFile)
	if err != nil {
		logger.Get().Error().Err(err).Msgf("Failed to read MCP server config file: %s", configFile)
		return fmt.Errorf("failed to read MCP server config %s: %w", configFile, err)
	}

	var servers []types.MCPServer
	if err := json.Unmarshal(data, &servers); err != nil {
		logger.Get().Error().Err(err).Msg("Failed to unmarshal MCP server config")
		return fmt.Errorf("failed to unmarshal MCP server config: %w", err)
	}

	if len(servers) == 0 {
		logger.Get().Warn().Msg("No MCP servers defined in config.")
		return nil
	}

	for _, serverConfig := range servers {
		var client RegisteredMCPClient // Use the interface type

		if serverConfig.Type == nil {
			logger.Get().Error().Msgf("Server type is nil for server: %s. Skipping.", serverConfig.Name)
			continue
		}
		// Now it's safe to dereference serverConfig.Type
		logger.Get().Debug().Msgf("Processing server: %s, Type: %s", serverConfig.Name, *serverConfig.Type)

		switch *serverConfig.Type {
		case "stdio":
			stdioClient := mcpclient.NewResilientStdioClient(serverConfig)
			if stdioClient != nil {
				client = stdioClient
			}
		case "sse":
			sseClient := mcpclient.NewResilientSSEClient(serverConfig)
			if sseClient != nil {
				client = sseClient
			}
		default:
			logger.Get().Warn().Msgf("Unsupported MCP server type: %s for server %s", *serverConfig.Type, serverConfig.Name)
			continue
		}

		if client != nil {
			RegisterClient(serverConfig.Name, client)
		} else {
			logger.Get().Error().Msgf("Failed to initialize client for server: %s", serverConfig.Name)
		}
	}
	logger.Get().Debug().Msg("MCP client initialization complete.")
	return nil
}
