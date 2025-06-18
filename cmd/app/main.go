package main

import (
	"fmt"
	"log"
	"os"

	localmcp "github.com/BowieHe/travel-u/pkg/mcp"
	"gopkg.in/yaml.v3"
)

func main() {
	fmt.Println("test")

	data, err := os.ReadFile("config/mcp-server.yaml")
	if err != nil {
		log.Fatalf("failed to read the config file: %v", err)
	}

	var servers []localmcp.MCPServer
	if err := yaml.Unmarshal(data, &servers); err != nil {
		log.Fatalf("failed to format the MCP Server from JSON: %v", err)
	}

	for _, server := range servers {
		log.Printf("get server name: %v, type: %v", server.Name, server.Type)
	}
}
