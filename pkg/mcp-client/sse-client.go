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

type ResilientSSEClient struct {
	baseURL              string
	headers              map[string]string
	client               *client.Client
	ctx                  context.Context
	cancel               context.CancelFunc
	reconnectCh          chan struct{}
	mutex                sync.RWMutex
	name                 string
	notificationChan     chan mcp.Notification
	notificationChanOnce sync.Once
}

func NewResilientSSEClient(name string, server types.McpServerOpt) *ResilientSSEClient {
	if server.Type != "sse" {
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())

	rsc := &ResilientSSEClient{
		baseURL:          server.URL,
		headers:          server.Headers,
		name:             name,
		ctx:              ctx,
		cancel:           cancel,
		reconnectCh:      make(chan struct{}, 1),
		notificationChan: make(chan mcp.Notification, 1),
	}

	go rsc.reconnectLoop()
	rsc.reconnectCh <- struct{}{} // Trigger initial connection
	return rsc
}

// func (rsc *ResilientSSEClient) SetHeader(key, value string) {
// 	rsc.mutex.Lock()
// 	defer rsc.mutex.Unlock()
// 	rsc.headers[key] = value
// }

func (rsc *ResilientSSEClient) connect() error {
	logger.Get().Debug().Msg("connecting...")
	rsc.mutex.Lock()
	defer rsc.mutex.Unlock()

	if rsc.client != nil {
		rsc.client.Close()
	}

	factory := NewClientFactory()
	factory.SetSSEConfig(rsc.baseURL, rsc.headers, rsc.name)
	c, err := factory.CreateClient("sse")
	if err != nil {
		logger.Get().Error().Err(err).Msgf("[%s] failed to create client from factory: %v", rsc.name, err)
		return err
	}
	if c == nil {
		logger.Get().Error().Err(err).Msgf("[%s] factory.CreateClient returned a nil client instance", rsc.name)
		return fmt.Errorf("factory.CreateClient returned a nil client for %s", rsc.name)
	}

	if err := c.Start(rsc.ctx); err != nil {
		logger.Get().Error().Err(err).Msgf("[%s] Failed to start client: %v", rsc.name, err) // Changed Fatalf to Printf
		return err
	}

	logger.Get().Debug().Msgf("[%s] Initializing client...\n", rsc.name)
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    rsc.name + "-client",
		Version: "1.0.0",
	}
	initRequest.Params.Capabilities = mcp.ClientCapabilities{}

	if _, err := c.Initialize(rsc.ctx, initRequest); err != nil {
		logger.Get().Error().Err(err).Msgf("[%s] Failed to initialize client: %v", rsc.name, err)
		return err
	}

	// todo)) delete, for test
	toolsResult, err := c.ListTools(rsc.ctx, mcp.ListToolsRequest{})
	if err != nil {
		logger.Get().Error().Err(err).Msgf("failed to list tools: %v", rsc.name)
	} else {
		logger.Get().Debug().Msgf("[%s] Server has %d tools available\n", rsc.name, len(toolsResult.Tools))
		for i, tool := range toolsResult.Tools {
			logger.Get().Debug().Msgf("  %d. %s - %s\n", i+1, tool.Name, tool.Description)
		}
	}

	c.OnNotification(func(jsonNotification mcp.JSONRPCNotification) { // Changed rsc.client to c
		actualNotification := jsonNotification.Notification // Directly assign the struct
		// Check if the notification is meaningful, e.g., by checking if its Method is set
		if actualNotification.Method == "" {
			logger.Get().Warn().Msgf("[%s] Received JSONRPCNotification with empty/invalid Notification (e.g., empty method)", rsc.name)
			return
		}

		select {
		case <-rsc.ctx.Done():
			logger.Get().Warn().Msgf("[%s] Context done, dropping notification: %s", rsc.name, actualNotification.Method)
			return
		default:
			// Non-blocking attempt to send to buffered channel
			select {
			case rsc.notificationChan <- actualNotification:
				// Successfully sent
			case <-rsc.ctx.Done(): // Check again in case ctx was cancelled during outer default
				logger.Get().Debug().Msgf("[%s] Context done during send, dropping notification: %s", rsc.name, actualNotification.Method)
			default:
				logger.Get().Debug().Msgf("[%s] Notification channel for client %s is full or no receiver, dropping notification: %s", rsc.name, rsc.name, actualNotification.Method)
			}
		}
	})

	rsc.client = c
	logger.Get().Debug().Msgf("Finish init client: %s", rsc.name)
	return nil
}

func (rsc *ResilientSSEClient) reconnectLoop() {
	logger.Get().Debug().Msgf("[%s] reconnectLoop started.", rsc.name)
	for {
		select {
		case <-rsc.ctx.Done():
			return
		case <-rsc.reconnectCh:
			logger.Get().Debug().Msgf("[%s] Received signal on reconnectCh.", rsc.name)
			logger.Get().Debug().Msg("Reconnecting SSE client...")

			for attempt := 1; attempt <= 5; attempt++ {
				if err := rsc.connect(); err != nil {
					logger.Get().Debug().Msgf("Reconnection attempt %d failed: %v", attempt, err)

					backoff := time.Duration(attempt) * time.Second
					select {
					case <-time.After(backoff):
					case <-rsc.ctx.Done():
						return
					}
				} else {
					logger.Get().Debug().Msg("Reconnected successfully")
					break
				}
			}
		}
	}
}

func (rsc *ResilientSSEClient) CallTool(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	logger.Get().Debug().Msgf("[%s] CallTool invoked.", rsc.name) // Renamed log for clarity
	rsc.mutex.RLock()
	client := rsc.client
	rsc.mutex.RUnlock()

	if client == nil {
		logger.Get().Warn().Msgf("[%s] CallTool: client is nil. Triggering connection attempt via reconnectCh.", rsc.name)
		select {
		case rsc.reconnectCh <- struct{}{}:
			logger.Get().Debug().Msgf("[%s] CallTool: Sent signal to reconnectCh for nil client.", rsc.name)
		default:
			logger.Get().Debug().Msgf("[%s] CallTool: reconnectCh is full or no listener ready for nil client signal.", rsc.name)
		}
		return nil, fmt.Errorf("client %s not connected, connection attempt triggered", rsc.name)
	}

	result, err := client.CallTool(ctx, req) // Use passed ctx
	if err != nil {
		logger.Get().Error().Err(err).Msgf("[%s] CallTool: error from client.CallTool: %v", rsc.name, err)
		if isConnectionError(err) {
			logger.Get().Warn().Msgf("[%s] CallTool: connection error detected. Triggering reconnect.", rsc.name)
			select {
			case rsc.reconnectCh <- struct{}{}:
				logger.Get().Warn().Msgf("[%s] CallTool: Sent signal to reconnectCh due to connection error.", rsc.name)
			default:
				logger.Get().Warn().Msgf("[%s] CallTool: reconnectCh is full or no listener ready for connection error signal.", rsc.name)
			}
			return nil, fmt.Errorf("client %s connection error: %w", rsc.name, err)
		}
		return nil, fmt.Errorf("client %s CallTool failed: %w", rsc.name, err)
	}
	return result, nil
}

func (rsc *ResilientSSEClient) Subscribe(ctx context.Context) (<-chan mcp.Notification, error) {
	rsc.mutex.RLock()
	client := rsc.client
	// notificationChan is part of rsc, so it's available
	rsc.mutex.RUnlock()

	if client == nil {
		return nil, fmt.Errorf("client %s not connected", rsc.name)
	}

	// For now, use an empty mcp.SubscribeRequest.
	// If this type requires specific parameters for your use case,
	// you may need to adjust this part or ask for clarification.
	subRequest := mcp.SubscribeRequest{}

	err := client.Subscribe(ctx, subRequest) // Call the library's Subscribe
	if err != nil {
		if isConnectionError(err) { // Reuse existing isConnectionError logic
			select {
			case rsc.reconnectCh <- struct{}{}:
			default:
			}
			return nil, fmt.Errorf("client %s connection error during subscribe: %w", rsc.name, err)
		}
		return nil, fmt.Errorf("client %s failed to subscribe: %w", rsc.name, err)
	}

	return rsc.notificationChan, nil
}

func (rsc *ResilientSSEClient) ListTools(ctx context.Context) ([]mcp.Tool, error) {
	rsc.mutex.RLock()
	client := rsc.client
	rsc.mutex.RUnlock()

	if client == nil {
		// Attempt to connect if client is nil, or return error
		// For simplicity, returning error here. Could trigger restart.
		// logger.Get().Warn().Msgf("[%s] ListTools: client is nil.", rsc.name) // Assuming logger is not used here or use "log" package
		logger.Get().Warn().Msgf("[%s] ListTools: client is nil.", rsc.name)
		return nil, fmt.Errorf("client %s not connected for ListTools", rsc.name)
	}

	listToolsRequest := mcp.ListToolsRequest{} // Empty request params for now
	result, err := client.ListTools(ctx, listToolsRequest)
	if err != nil {
		// logger.Get().Error().Err(err).Msgf("[%s] ListTools: error from client.ListTools", rsc.name)
		logger.Get().Error().Err(err).Msgf("[%s] ListTools: error from client.ListTools: %v", rsc.name, err)
		// Optionally trigger restart on connection error
		if isConnectionError(err) { // Assuming isConnectionError exists
			select {
			case rsc.reconnectCh <- struct{}{}:
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

func (rsc *ResilientSSEClient) Close() error {
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

func isConnectionError(err error) bool {
	return errors.Is(err, errors.New("connection lost")) ||
		errors.Is(err, errors.New("connection failed"))
}
