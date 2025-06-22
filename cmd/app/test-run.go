package main

import (
	"context"
	"fmt"
	"testing"

	mcpclient "github.com/BowieHe/travel-u/pkg/mcp-client"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/mark3labs/mcp-go/mcp"
)

func TestFetchTool(t *testing.T) {
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
		t.Fatal("Failed to create client")
	}
	defer client.Close()

	// 准备请求参数
	args := map[string]any{
		"url":        "https://mcp-go.dev/clients/operations",
		"max_length": 5000,
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
		t.Fatalf("CallTool failed: %v", err)
	}

	// 解析结果
	var content struct {
		Text string `json:"content"`
	}
	// 使用result.Content[0]作为内容来源
	if len(result.Content) == 0 {
		t.Fatal("No content in result")
	}
	if textContent, ok := result.Content[0].(mcp.TextContent); ok {
		content.Text = textContent.Text
	} else {
		t.Fatalf("Unexpected content type: %T", result.Content[0])
	}

	fmt.Printf("Fetched content length: %d\n", len(content.Text))
}
