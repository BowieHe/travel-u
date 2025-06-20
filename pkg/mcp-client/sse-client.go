package mcpclient

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"

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

func NewResilientSSEClient(server types.MCPServer) *ResilientSSEClient {
	if *server.Type != "sse" {
		return nil
	}
	ctx, cancel := context.WithCancel(context.Background())

	rsc := &ResilientSSEClient{
		baseURL:          *server.BaseURL,
		headers:          server.Headers,
		name:             server.Name,
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
	log.Println("connecting...")
	rsc.mutex.Lock()
	defer rsc.mutex.Unlock()

	if rsc.client != nil {
		rsc.client.Close()
	}

	factory := NewClientFactory()
	factory.SetSSEConfig(rsc.baseURL, rsc.headers, rsc.name)
	c, err := factory.CreateClient("sse")
	if err != nil {
		log.Printf("[%s] failed to create client from factory: %v", rsc.name, err)
		return err
	}
	if c == nil {
		log.Printf("[%s] factory.CreateClient returned a nil client instance", rsc.name)
		return fmt.Errorf("factory.CreateClient returned a nil client for %s", rsc.name)
	}

	if err := c.Start(rsc.ctx); err != nil {
		log.Printf("[%s] Failed to start client: %v", rsc.name, err) // Changed Fatalf to Printf
		return err
	}

	fmt.Printf("[%s] Initializing client...\n", rsc.name)
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    rsc.name + "-client",
		Version: "1.0.0",
	}
	initRequest.Params.Capabilities = mcp.ClientCapabilities{}

	if _, err := c.Initialize(rsc.ctx, initRequest); err != nil {
		log.Printf("[%s] Failed to initialize client: %v", rsc.name, err)
		return err
	}

	// todo)) delete, for test
	toolsResult, err := c.ListTools(rsc.ctx, mcp.ListToolsRequest{})
	if err != nil {
		log.Printf("[%s] Failed to list tools: %v", rsc.name, err)
	} else {
		fmt.Printf("[%s] Server has %d tools available\n", rsc.name, len(toolsResult.Tools))
		for i, tool := range toolsResult.Tools {
			fmt.Printf("  %d. %s - %s\n", i+1, tool.Name, tool.Description)
		}
	}

	c.OnNotification(func(jsonNotification mcp.JSONRPCNotification) { // Changed rsc.client to c
		actualNotification := jsonNotification.Notification // Directly assign the struct
		// Check if the notification is meaningful, e.g., by checking if its Method is set
		if actualNotification.Method == "" {
			log.Printf("[%s] Received JSONRPCNotification with empty/invalid Notification (e.g., empty method)", rsc.name)
			return
		}

		select {
		case <-rsc.ctx.Done():
			log.Printf("[%s] Context done, dropping notification: %s", rsc.name, actualNotification.Method)
			return
		default:
			// Non-blocking attempt to send to buffered channel
			select {
			case rsc.notificationChan <- actualNotification:
				// Successfully sent
			case <-rsc.ctx.Done(): // Check again in case ctx was cancelled during outer default
				log.Printf("[%s] Context done during send, dropping notification: %s", rsc.name, actualNotification.Method)
			default:
				log.Printf("[%s] Notification channel for client %s is full or no receiver, dropping notification: %s", rsc.name, rsc.name, actualNotification.Method)
			}
		}
	})

	rsc.client = c
	return nil
}

func (rsc *ResilientSSEClient) reconnectLoop() {
	log.Printf("[%s] reconnectLoop started.", rsc.name)
	for {
		select {
		case <-rsc.ctx.Done():
			return
		case <-rsc.reconnectCh:
			log.Printf("[%s] Received signal on reconnectCh.", rsc.name)
			log.Println("Reconnecting SSE client...")

			for attempt := 1; attempt <= 5; attempt++ {
				if err := rsc.connect(); err != nil {
					log.Printf("Reconnection attempt %d failed: %v", attempt, err)

					backoff := time.Duration(attempt) * time.Second
					select {
					case <-time.After(backoff):
					case <-rsc.ctx.Done():
						return
					}
				} else {
					log.Println("Reconnected successfully")
					break
				}
			}
		}
	}
}

func (rsc *ResilientSSEClient) CallTool(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	log.Printf("[%s] CallTool invoked.", rsc.name) // Renamed log for clarity
	rsc.mutex.RLock()
	client := rsc.client
	rsc.mutex.RUnlock()

	if client == nil {
		log.Printf("[%s] CallTool: client is nil. Triggering connection attempt via reconnectCh.", rsc.name)
		select {
		case rsc.reconnectCh <- struct{}{}:
			log.Printf("[%s] CallTool: Sent signal to reconnectCh for nil client.", rsc.name)
		default:
			log.Printf("[%s] CallTool: reconnectCh is full or no listener ready for nil client signal.", rsc.name)
		}
		return nil, fmt.Errorf("client %s not connected, connection attempt triggered", rsc.name)
	}

	result, err := client.CallTool(ctx, req) // Use passed ctx
	if err != nil {
		log.Printf("[%s] CallTool: error from client.CallTool: %v", rsc.name, err)
		if isConnectionError(err) {
			log.Printf("[%s] CallTool: connection error detected. Triggering reconnect.", rsc.name)
			select {
			case rsc.reconnectCh <- struct{}{}:
				log.Printf("[%s] CallTool: Sent signal to reconnectCh due to connection error.", rsc.name)
			default:
				log.Printf("[%s] CallTool: reconnectCh is full or no listener ready for connection error signal.", rsc.name)
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
