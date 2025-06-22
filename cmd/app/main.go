package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/BowieHe/travel-u/internal/service"
	"github.com/BowieHe/travel-u/pkg/logger"
	mcpclient "github.com/BowieHe/travel-u/pkg/mcp-client"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/BowieHe/travel-u/pkg/utils"
	"github.com/mark3labs/mcp-go/mcp"
)

func main() {
	appCtx, cancelApp := context.WithCancel(context.Background())
	defer cancelApp() // 确保在 main 退出时调用

	// 监听 OS 信号以进行优雅关闭
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-signalChan
		logger.Get().Info().Msgf("接收到信号: %s, 正在关闭...", sig)
		cancelApp()
	}()

	utils.LoadEnv() // 假设这个不需要 appCtx

	debug := flag.Bool("debug", true, "Run the code in debug mode")
	flag.Parse()
	logger.Init(*debug)
	// Initialize MCP Clients
	if err := service.InitializeMCPClients("config/mcp-server.json"); err != nil {
		logger.Get().Fatal().Err(err).Msg("Failed to initialize MCP clients")
		// os.Exit(1) // or handle error appropriately
	}

	logger.Get().Info().Msg("应用启动中...")

	// ExampleFetchTool()
	// fmt.Println("finish test ")
	// service.Testllm()
	service.TestllmStreaming()
	// prompt := "What would be a good company name for a company that makes colorful socks?"
	// completion, err := ll.GenerateFromSinglePrompt(appCtx, llm, prompt)
	// if err != nil {
	// 	logger.Get().Err(err)
	// }
	// logger.Get().Info().Msg(completion)
	// todo)) uncommand in future
	// servers := service.GenServer()
	// for _, server := range servers {
	// 	if *server.Type == "sse" {
	// 		log.Println("init sse")
	// 		c := lm.NewResilientSSEClient(server)
	// 		c.CallTool(appCtx, mcp.CallToolRequest{ // Pass appCtx
	// 			Params: mcp.CallToolParams{
	// 				Name: "hello_world",
	// 				Arguments: map[string]interface{}{
	// 					"name": "World",
	// 				},
	// 			},
	// 		})
	// 	} else if *server.Type == "stdio" {
	// 		log.Println("init stdio")
	// 		c := lm.NewResilientStdioClient(server)
	// 		c.CallTool(appCtx, mcp.CallToolRequest{
	// 			Params: mcp.CallToolParams{
	// 				Name: "hello_world",
	// 				Arguments: map[string]interface{}{
	// 					"name": "World",
	// 				},
	// 			},
	// 		})
	// 	} else {
	// 		log.Println("others")
	// 	}
	// }

	logger.Get().Debug().Msg("应用正在运行。按 CTRL+C 退出。")

	// 等待 appCtx 被取消 (例如，通过信号处理器)
	<-appCtx.Done()

	logger.Get().Info().Msg("应用正在优雅关闭...")
	// 在这里可以执行任何最终的清理工作
	logger.Get().Info().Msg("应用已停止。")
}

func ExampleFetchTool() {
	// 创建服务器配置
	serverType := "stdio"
	command := "uvx"
	serverConfig := types.MCPServer{
		Name:    "fetch",
		Type:    &serverType,
		Command: &command,
		Args:    []string{"mcp-server-fetch"},
	}

	// 创建客户端
	client := mcpclient.NewResilientStdioClient(serverConfig)
	if client == nil {
		log.Fatal("Failed to create client")
	}
	defer client.Close()

	// 准备请求参数
	args := map[string]any{
		"url": "https://mcp-go.dev/clients/operations",
	}

	// 调用工具
	req := mcp.CallToolRequest{
		Params: mcp.CallToolParams{
			Name:      "fetch",
			Arguments: args,
		},
	}

	result, err := client.CallTool(context.Background(), req)
	if err != nil {
		log.Fatalf("CallTool failed: %v", err)
	}

	if len(result.Content) == 0 {
		log.Fatal("No content in result")
	}
	if textContent, ok := result.Content[0].(mcp.TextContent); ok {
		fmt.Println(textContent.Text)
	} else {
		log.Fatalf("Unexpected content type: %T", result.Content[0])
	}
}
