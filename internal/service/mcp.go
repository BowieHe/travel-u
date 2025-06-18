package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	localmcp "github.com/BowieHe/travel-u/pkg/mcp"
	lmc "github.com/BowieHe/travel-u/pkg/mcp-client"
	"github.com/BowieHe/travel-u/pkg/utils"
	"github.com/mark3labs/mcp-go/mcp"
)

func GenServer() []localmcp.MCPServer {
	data, err := os.ReadFile("config/mcp-server.json")
	if err != nil {
		log.Fatalf("failed to read the config file: %v", err)
	}

	var servers []localmcp.MCPServer
	if err := json.Unmarshal(data, &servers); err != nil {
		log.Fatalf("failed to unmarshal MCP Server config from JSON: %v", err)
	}

	// Expand environment variables in server configurations
	for i := range servers {

		server := &servers[i] // Use a pointer to modify the original struct in the slice

		if server.BaseURL != nil && *server.BaseURL != "" {
			expandedBaseURL := utils.ExpandEnvVars(*server.BaseURL)
			server.BaseURL = &expandedBaseURL
		}

		if server.Command != nil && *server.Command != "" {
			expandedCommand := utils.ExpandEnvVars(*server.Command)
			server.Command = &expandedCommand
		}

		if server.Args != nil {
			for j, arg := range server.Args {
				server.Args[j] = utils.ExpandEnvVars(arg)
			}
		}

		if server.Env != nil {
			for key, val := range server.Env {
				server.Env[key] = utils.ExpandEnvVars(val)
			}
		}

		if server.Headers != nil {
			for key, val := range server.Headers {
				server.Headers[key] = utils.ExpandEnvVars(val)
			}
		}
	}

	for i, server := range servers {
		jsonData, err := json.MarshalIndent(server, "", "  ")
		if err != nil {
			log.Printf("Error marshalling processed server to JSON for logging: %v", err)
			log.Printf("Processed server data (default format) (server %d): %+v", i, server)
		} else {
			log.Printf("Processed server config with env vars (server %d):\n%s", i, string(jsonData))
		}
	}

	return servers
}

func GenClient(ctx context.Context) []lmc.MCPClient {
	servers := GenServer()      // Call GenServer internally to get configurations
	var clients []lmc.MCPClient // Changed type from BaseClient to MCPClient

	// Iterate over server configurations and create clients
	for _, serverCfg := range servers {
		log.Printf("generating clients for server: %v", serverCfg.Name)
		client, err := lmc.NewMCPClientFromConfig(ctx, serverCfg)
		if err != nil {
			log.Printf("Error generating client for server %s: %v", serverCfg.Name, err)
			continue // Skip to the next server configuration on error
		}

		log.Println("Initializing client...")
		initRequest := mcp.InitializeRequest{}
		initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
		initRequest.Params.ClientInfo = mcp.Implementation{
			Name:    serverCfg.Name + "-client",
			Version: "1.0.0",
		}
		serverInfo, err := client.Initialize(ctx, initRequest)
		if err != nil {
			log.Fatalf("Failed to initialize: %v", err)
		}
		if serverInfo.Capabilities.Tools != nil {
			fmt.Println("Fetching available tools...")
			toolsRequest := mcp.ListToolsRequest{}
			toolsResult, err := client.ListTools(ctx, toolsRequest)
			if err != nil {
				log.Printf("Failed to list tools: %v", err)
			} else {
				fmt.Printf("Server has %d tools available\n", len(toolsResult.Tools))
				for i, tool := range toolsResult.Tools {
					fmt.Printf("  %d. %s - %s\n", i+1, tool.Name, tool.Description)
				}
			}
		}
		clients = append(clients, client) // Store the created client
		if serverCfg.Name != "" {
			log.Printf("Successfully generated client for server: %s", serverCfg.Name)
		} else {
			log.Printf("Successfully generated client for an unnamed server.")
		}
		// TODO: Further integrate ctx if client operations (e.g., client.Start(ctx)) are needed.
	}
	// Note: The 'clients' slice is populated but not returned or actively managed further by this function.
	// This behavior might need to be revisited based on application requirements for client lifecycle management,
	// such as returning the clients or starting them.
	// For now, we assume clients might start themselves or be managed elsewhere.
	// If clients need to be explicitly started and managed here, that logic would be added.
	// For example, you might iterate over `clients` and call `client.Start(ctx)`.

	return clients
}
