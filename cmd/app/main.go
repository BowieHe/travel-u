package main

import (
	"context"
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/BowieHe/travel-u/pkg/utils"
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
	logger.Get().Info().Str("foo", "bar").Msg("Hello world")
	logger.Get().Info().Msg("应用启动中...")

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
