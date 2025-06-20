package mcpclient

import (
	"fmt"
	"log"
	"os"

	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/client/transport"
)

type ClientFactory struct {
	configs map[string]any
}

func NewClientFactory() *ClientFactory {
	return &ClientFactory{
		configs: make(map[string]any),
	}
}

func (cf *ClientFactory) SetStdioConfig(command string, args ...string) {
	cf.configs["stdio"] = types.StdioOptions{
		Command: command,
		Args:    args,
	}
}

func (cf *ClientFactory) SetStreamableHTTPConfig(baseURL string, headers map[string]string, name string) {
	cf.configs["streamablehttp"] = types.HTTPOptions{
		BaseURL: baseURL,
		Headers: headers,
		Name:    name,
	}
}

func (cf *ClientFactory) SetSSEConfig(baseURL string, headers map[string]string, name string) {
	cf.configs["sse"] = types.HTTPOptions{
		BaseURL: baseURL,
		Headers: headers,
		Name:    name,
	}
}

func (cf *ClientFactory) CreateClient(cType string) (*client.Client, error) {
	switch cType {
	case "stdio":
		config, ok := cf.configs["stdio"].(types.StdioOptions)
		if !ok {
			return nil, fmt.Errorf("stdio config not set")
		}

		return client.NewStdioMCPClient(config.Command, nil, config.Args...)

	case "streamableHttp":
		config, ok := cf.configs["streamableHttp"].(types.HTTPOptions)
		if !ok {
			return nil, fmt.Errorf("streamableHttp config not set")
		}

		options := []transport.StreamableHTTPCOption{}
		if len(config.Headers) > 0 {
			options = append(options, transport.WithHTTPHeaders(config.Headers))
		}
		return client.NewStreamableHttpClient(config.BaseURL, options...)

	case "sse":
		config, ok := cf.configs["sse"].(types.HTTPOptions)
		if !ok {
			return nil, fmt.Errorf("sse config not set")
		}

		options := []transport.ClientOption{}
		if len(config.Headers) > 0 {
			options = append(options, transport.WithHeaders(config.Headers))
		}

		return client.NewSSEMCPClient(config.BaseURL, options...)

	default:
		return nil, fmt.Errorf("unknown client type: %s", cType)
	}
}

// Usage
func demonstrateClientFactory() {
	factory := NewClientFactory()

	// Configure transports
	factory.SetStdioConfig("go", "run", "server.go")
	factory.SetStreamableHTTPConfig("http://localhost:8080/mcp", map[string]string{
		"Authorization": "Bearer token",
	}, "http")
	factory.SetSSEConfig("http://localhost:8080/mcp/sse", map[string]string{
		"Authorization": "Bearer token",
	}, "sse")

	// Create client based on environment
	transport := os.Getenv("MCP_TRANSPORT")
	if transport == "" {
		transport = "stdio"
	}

	client, err := factory.CreateClient(transport)
	if err != nil {
		log.Fatal(err)
	}
	defer client.Close()

	// Use client...
}
