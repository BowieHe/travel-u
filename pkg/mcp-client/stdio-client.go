package mcpclient

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"

	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/BowieHe/travel-u/pkg/types"
)

type ResilientStdioClient struct {
	command              string
	args                 []string
	env                  map[string]string // New field
	client               *client.Client
	ctx                  context.Context
	cancel               context.CancelFunc
	restartCh            chan struct{}
	mutex                sync.RWMutex
	name                 string
	notificationChan     chan mcp.Notification
	notificationChanOnce sync.Once
}

func NewResilientStdioClient(server types.MCPServer) *ResilientStdioClient {
	if *server.Type != "stdio" {
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())

	rsc := &ResilientStdioClient{
		command:          *server.Command,
		args:             server.Args,
		env:              server.Env, // Assign the Env map
		name:             server.Name,
		ctx:              ctx,
		cancel:           cancel,
		restartCh:        make(chan struct{}, 1),
		notificationChan: make(chan mcp.Notification, 1),
	}

	go rsc.restartLoop()
	rsc.restartCh <- struct{}{} // Trigger initial connection/start
	return rsc
}

func (rsc *ResilientStdioClient) connect() error {
	rsc.mutex.Lock()
	defer rsc.mutex.Unlock()

	if rsc.client != nil {
		rsc.client.Close()
	}

	factory := NewClientFactory()
	// Pass command and its arguments directly, mirroring the setup in stdio-client-prev.go.
	// The rsc.name should not be passed as a command-line argument to the stdio server.
	// allArgs := append([]string{rsc.name}, rsc.args...) // This was incorrect.
	// Pass command, its arguments, and the environment variables.
	factory.SetStdioConfig(rsc.command, rsc.env, rsc.args...) // Pass rsc.env here

	logger.Get().Debug().Msgf("[%s] Attempting to create client from factory with command: %s, args: %v, env: %v", rsc.name, rsc.command, rsc.args, rsc.env) // Added env to log
	c, err := factory.CreateClient("stdio")
	if err != nil {
		logger.Get().Error().Msgf("[%s] failed to create client from factory: %v", rsc.name, err)
		return err
	}
	if c == nil {
		logger.Get().Error().Msgf("[%s] factory.CreateClient returned a nil client instance without error", rsc.name) // Clarified log
		return fmt.Errorf("factory.CreateClient returned a nil client for %s", rsc.name)
	}
	logger.Get().Debug().Msgf("[%s] Client created successfully from factory.", rsc.name)

	logger.Get().Debug().Msgf("[%s] Attempting to start client...", rsc.name)
	if err := c.Start(rsc.ctx); err != nil {
		logger.Get().Error().Msgf("[%s] Failed to start stdio client: %v", rsc.name, err)
		return err
	}
	logger.Get().Debug().Msgf("[%s] Client started successfully.", rsc.name)

	logger.Get().Debug().Msgf("[%s] Initializing stdio client (sending Initialize request)...\n", rsc.name) // Clarified log
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    rsc.name + "-client",
		Version: "1.0.0",
	}
	initRequest.Params.Capabilities = mcp.ClientCapabilities{}

	// Define a timeout for the Initialize call
	initializeTimeout := 15 * time.Second
	initCtx, initCancel := context.WithTimeout(rsc.ctx, initializeTimeout)
	defer initCancel()

	initializeResult, err := c.Initialize(initCtx, initRequest)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			logger.Get().Error().Msgf("[%s] Failed to initialize client: Initialize call timed out after %v: %v", rsc.name, initializeTimeout, err)
		} else {
			logger.Get().Error().Msgf("[%s] Failed to initialize client: %v", rsc.name, err)
		}
		return err
	}
	logger.Get().Debug().Msgf("[%s] Client initialized successfully. Server capabilities: %+v", rsc.name, initializeResult.Capabilities)

	// todo)) delete, for test
	logger.Get().Debug().Msgf("[%s] Attempting to list tools...", rsc.name)
	toolsResult, err := c.ListTools(rsc.ctx, mcp.ListToolsRequest{})
	if err != nil {
		logger.Get().Error().Msgf("[%s] Failed to list tools: %v", rsc.name, err)
		// Even if listing tools fails, we might still have a working client for other operations.
		// Depending on requirements, you might choose to return err here or proceed.
		// For now, we'll log and proceed to register OnNotification.
	} else {
		logger.Get().Debug().Msgf("[%s] Tools listed successfully.", rsc.name)
		logger.Get().Debug().Msgf("[%s] Server has %d tools available\n", rsc.name, len(toolsResult.Tools))
		for i, tool := range toolsResult.Tools {
			logger.Get().Debug().Msgf("  %d. %s - %s\n", i+1, tool.Name, tool.Description)
		}
	}

	logger.Get().Debug().Msgf("[%s] Setting up OnNotification callback...", rsc.name)
	c.OnNotification(func(jsonNotification mcp.JSONRPCNotification) { // Changed rsc.client to c
		actualNotification := jsonNotification.Notification // Directly assign the struct
		// Check if the notification is meaningful, e.g., by checking if its Method is set
		if actualNotification.Method == "" {
			logger.Get().Warn().Msgf("[%s] Received JSONRPCNotification with empty/invalid Notification (e.g., empty method)", rsc.name)
			return
		}

		select {
		case <-rsc.ctx.Done():
			logger.Get().Info().Msgf("[%s] Context done, dropping notification: %s", rsc.name, actualNotification.Method)
			return
		default:
			// Non-blocking attempt to send to buffered channel
			select {
			case rsc.notificationChan <- actualNotification:
				// Successfully sent
			case <-rsc.ctx.Done(): // Check again in case ctx was cancelled during outer default
				logger.Get().Info().Msgf("[%s] Context done during send, dropping notification: %s", rsc.name, actualNotification.Method)
			default:
				logger.Get().Warn().Msgf("[%s] Notification channel for client %s is full or no receiver, dropping notification: %s", rsc.name, rsc.name, actualNotification.Method)
			}
		}
	})

	rsc.client = c
	return nil
}

func (rsc *ResilientStdioClient) restartLoop() {
	logger.Get().Debug().Msgf("[%s] restartLoop started.", rsc.name)
	for {
		select {
		case <-rsc.ctx.Done():
			return
		case <-rsc.restartCh:
			logger.Get().Debug().Msgf("[%s] Received signal on restartCh.", rsc.name)
			logger.Get().Debug().Msgf("[%s] Restarting stdio client...", rsc.name) // Changed log message

			for attempt := 1; attempt <= 5; attempt++ {
				if err := rsc.connect(); err != nil {
					logger.Get().Error().Msgf("[%s] Restart attempt %d failed: %v", rsc.name, attempt, err) // Changed log message

					backoff := time.Duration(attempt) * time.Second
					select {
					case <-time.After(backoff):
					case <-rsc.ctx.Done():
						return
					}
				} else {
					logger.Get().Debug().Msgf("[%s] Restarted stdio client successfully", rsc.name) // Changed log message
					break
				}
			}
		}
	}
}

func (rsc *ResilientStdioClient) CallTool(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	logger.Get().Debug().Msgf("[%s] CallTool invoked.", rsc.name)
	rsc.mutex.RLock()
	client := rsc.client
	rsc.mutex.RUnlock()

	if client == nil {
		logger.Get().Warn().Msgf("[%s] CallTool: client is nil. Triggering connection attempt via restartCh.", rsc.name)
		select {
		case rsc.restartCh <- struct{}{}:
			logger.Get().Info().Msgf("[%s] CallTool: Sent signal to restartCh for nil client.", rsc.name)
		default:
			logger.Get().Warn().Msgf("[%s] CallTool: restartCh is full or no listener ready for nil client signal.", rsc.name)
		}
		return nil, fmt.Errorf("client %s not connected, connection attempt triggered", rsc.name)
	}

	result, err := client.CallTool(ctx, req)
	if err != nil {
		logger.Get().Error().Msgf("[%s] CallTool: error from client.CallTool: %v", rsc.name, err)
		if isConnectionError(err) {
			logger.Get().Error().Msgf("[%s] CallTool: connection error detected. Triggering restart.", rsc.name)
			select {
			case rsc.restartCh <- struct{}{}:
				logger.Get().Info().Msgf("[%s] CallTool: Sent signal to restartCh due to connection error.", rsc.name)
			default:
				logger.Get().Warn().Msgf("[%s] CallTool: restartCh is full or no listener ready for connection error signal.", rsc.name)
			}
			return nil, fmt.Errorf("client %s connection error: %w", rsc.name, err)
		}
		return nil, fmt.Errorf("client %s CallTool failed: %w", rsc.name, err)
	}
	return result, nil
}

func (rsc *ResilientStdioClient) Subscribe(ctx context.Context) (<-chan mcp.Notification, error) {
	rsc.mutex.RLock()
	client := rsc.client
	rsc.mutex.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("client %s not connected", rsc.name)
	}
	subRequest := mcp.SubscribeRequest{}
	err := client.Subscribe(ctx, subRequest) // This is the library's client.Subscribe
	if err != nil {
		if isConnectionError(err) {
			select {
			case rsc.restartCh <- struct{}{}:
			default:
			}
			return nil, fmt.Errorf("client %s connection error during subscribe: %w", rsc.name, err)
		}
		return nil, fmt.Errorf("client %s failed to subscribe: %w", rsc.name, err)
	}
	return rsc.notificationChan, nil
}

func (rsc *ResilientStdioClient) ListTools(ctx context.Context) ([]mcp.Tool, error) {
	rsc.mutex.RLock()
	client := rsc.client
	rsc.mutex.RUnlock()

	if client == nil {
		// Attempt to connect if client is nil, or return error
		// For simplicity, returning error here. Could trigger restart.
		logger.Get().Warn().Msgf("[%s] ListTools: client is nil.", rsc.name)
		return nil, fmt.Errorf("client %s not connected for ListTools", rsc.name)
	}

	listToolsRequest := mcp.ListToolsRequest{} // Empty request params for now
	result, err := client.ListTools(ctx, listToolsRequest)
	if err != nil {
		logger.Get().Error().Err(err).Msgf("[%s] ListTools: error from client.ListTools", rsc.name)
		// Optionally trigger restart on connection error
		if isConnectionError(err) { // Assuming isConnectionError exists
			select {
			case rsc.restartCh <- struct{}{}:
			default:
			}
		}
		return nil, fmt.Errorf("client %s ListTools failed: %w", rsc.name, err)
	}
	if result == nil {
		return []mcp.Tool{}, nil // Return empty slice if result is nil but no error
	}
	return result.Tools, nil
}

func (rsc *ResilientStdioClient) Close() error {
	rsc.cancel()
	rsc.mutex.Lock()
	defer rsc.mutex.Unlock()
	if rsc.notificationChan != nil {
		rsc.notificationChanOnce.Do(func() {
			close(rsc.notificationChan)
		})
	}
	if rsc.client != nil {
		return rsc.client.Close()
	}
	return nil
}

// Removed isConnectionError as it's already defined in the package (e.g., in sse-client.go)
