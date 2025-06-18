package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/BowieHe/travel-u/internal/service"
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
		log.Printf("接收到信号: %s, 正在关闭...", sig)
		cancelApp()
	}()

	log.Println("应用启动中...")

	utils.LoadEnv() // 假设这个不需要 appCtx

	// lmc.DemonstrateStdioClientUsage()

	// 假设 service.GenClient 将被更新以接受 appCtx
	// 如果 GenClient 返回一个需要关闭的客户端实例，您可能需要处理它
	// 例如: client, err := service.GenClient(appCtx)
	// if err != nil { log.Fatalf(...) }
	// if client != nil && client.Closer != nil { defer client.Close() }
	service.GenClient(appCtx) // 修改这里以传递 appCtx

	log.Println("应用正在运行。按 CTRL+C 退出。")

	// 等待 appCtx 被取消 (例如，通过信号处理器)
	<-appCtx.Done()

	log.Println("应用正在优雅关闭...")
	// 在这里可以执行任何最终的清理工作
	log.Println("应用已停止。")
}
