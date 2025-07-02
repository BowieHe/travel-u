package main

import (
	"bufio"
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/BowieHe/travel-u/internal/agents/orchestrator"
	"github.com/BowieHe/travel-u/internal/service"
	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/BowieHe/travel-u/pkg/utils"
	"github.com/tmc/langchaingo/memory"
)

func main() {
	appCtx, cancelApp := context.WithCancel(context.Background())
	defer cancelApp() // 确保在 main 退出时调用

	// 监听 OS 信号以进行优雅关闭
	signalChan := make(chan os.Signal, 1)
	signal.Notify(signalChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-signalChan
		logger.Get().Info().Msg("接收到中断信号，正在强制退出...")
		os.Exit(0)
	}()

	utils.LoadEnv() // 假设这个不需要 appCtx

	debug := flag.Bool("debug", false, "Run the code in debug mode")
	flag.Parse()
	logger.Init(*debug)
	// Initialize MCP Clients
	if err := service.InitializeMCPClients("config/mcp-servers.json"); err != nil {
		logger.Get().Fatal().Err(err).Msg("Failed to initialize MCP clients")
		// os.Exit(1) // or handle error appropriately
	}

	logger.Get().Info().Msg("应用启动中...")

	// --- 新的 Agent 驱动的聊天循环 ---
	brain, err := orchestrator.New()
	if err != nil {
		logger.Get().Fatal().Err(err).Msg("Failed to create brain (OrchestratorAgent)")
	}
	chatMemory := memory.NewConversationBuffer()

	fmt.Println("Hierarchical Agent System Started! Type 'quit' to exit.")
	scanner := bufio.NewScanner(os.Stdin)

	for {
		fmt.Print("You: ")
		if !scanner.Scan() {
			break
		}
		userInput := strings.TrimSpace(scanner.Text())
		if userInput == "quit" {
			cancelApp()
			break
		}
		if userInput == "" {
			continue
		}

		// 将任务交给大脑处理
		summary, err := brain.Execute(appCtx, userInput, chatMemory)
		if err != nil {
			fmt.Printf("\nError from Brain: %v\n", err)
			continue
		}
		fmt.Printf("\nBrain Summary: %s\n", summary)
	}

	// llm.StartChatCLI(cancelApp) // 旧的启动方式已被替换
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

	logger.Get().Debug().Msg("应用正在优雅关闭...")
	// 在这里可以执行任何最终的清理工作
	logger.Get().Info().Msg("应用已停止。")
}
