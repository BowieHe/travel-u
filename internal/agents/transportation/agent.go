package transportation

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/BowieHe/travel-u/internal/agents"
	"github.com/BowieHe/travel-u/internal/llm"
	"github.com/BowieHe/travel-u/pkg/model"
	"github.com/BowieHe/travel-u/pkg/types"
	langchainllm "github.com/tmc/langchaingo/llms"
	"github.com/tmc/langchaingo/memory"
)

// TransportationAgent 是我们的“出行专家”。
// 它专门处理与交通、导航、票务相关的任务。
type TransportationAgent struct {
	llm        langchainllm.Model
	chatMemory *memory.ConversationBuffer
}

// New 创建一个新的 TransportationAgent 实例。
func New() (*TransportationAgent, error) {
	llm, err := model.GetOpenAI(types.LLMOption{
		Model: "gpt-4o",
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get LLM for TransportationAgent: %w", err)
	}
	return &TransportationAgent{
		llm:        llm,
		chatMemory: memory.NewConversationBuffer(),
	}, nil
}

func (a *TransportationAgent) ExecuteNew(ctx context.Context, initialQuery string, history *memory.ConversationBuffer) (summary string, err error) {
	fmt.Println("\n[TransportationAgent] 您好！我是您的出行专家，有什么可以帮您？")
	fmt.Printf("[TransportationAgent] 我收到的任务是: %s\n", initialQuery)

	// 将大脑传递的初始任务添加到记忆中
	a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.SystemChatMessage{Content: "你是一个专业的出行助手，你的任务是帮助用户查询和处理与交通、票务相关的信息。请在必要时使用工具，并在信息不足时向用户提问。"})
	a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.HumanChatMessage{Content: initialQuery})

	// 启动对话循环
	scanner := bufio.NewScanner(os.Stdin)
	for {
		// 1. 调用LLM获取回复或工具调用
		response, interrupted, err := llm.GenerateResponseNew(ctx, a.llm, a.chatMemory, llm.MCPTools())
		if err != nil {
			fmt.Printf("\n[TransportationAgent] Error: %v\n", err)
			continue
		}

		// 2. 检查是否需要中断以等待用户输入
		if interrupted {
			// 寻找 ask_user_for_input 工具调用
			var question string
			for _, toolCall := range response.ToolCalls {
				if toolCall.FunctionCall.Name == "ask_user_for_input" {
					// 假设参数是一个包含 "question" 字段的JSON
					var args struct {
						Question string `json:"question"`
					}
					if err := llm.ParseToolArguments(toolCall.FunctionCall.Arguments, &args); err == nil {
						question = args.Question
					}
					break
				}
			}

			if question == "" {
				question = "I need more information, but I couldn't form a specific question. Can you provide more details?"
			}

			// 向用户显示问题并获取输入
			fmt.Printf("AI: %s\n", question)
			fmt.Print("You: ")
			if !scanner.Scan() {
				break // End of input
			}
			userInput := strings.TrimSpace(scanner.Text())

			// 将用户的回答添加到记忆中，然后重新开始循环
			a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.HumanChatMessage{Content: userInput})
			continue
		}

		// 3. 处理常规工具调用
		if response.StopReason == "tool_calls" {
			for _, toolCall := range response.ToolCalls {
				if err := llm.HandleToolCallAndRespond(ctx, toolCall, a.llm, a.chatMemory); err != nil {
					fmt.Printf("\n[TransportationAgent] Error handling tool call: %v\n", err)
				}
			}
			continue // 工具调用后，再次循环让LLM根据工具结果生成回复
		}

		// 4. 如果没有工具调用或中断，直接打印AI回复
		// 只有当有实际内容时才打印和添加消息
		if response.Content != "" {
			fmt.Printf("AI: %s\n", response.Content)
			a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.AIChatMessage{Content: response.Content})
		}

		// 5. 检查是否应该结束对话
		// 在这个简单的实现中，我们假设如果LLM没有进行工具调用也没有提问，任务就完成了。
		// 在更复杂的场景中，这里可能需要一个更明确的结束信号。
		if response.StopReason != "tool_calls" && !interrupted {
			fmt.Println("\n[TransportationAgent] AI has concluded its turn. Assuming task is complete.")
			break
		}
	}

	// 5. 任务完成，生成摘要
	// TODO: 使用LLM根据完整的对话历史生成更智能的摘要
	finalSummary := "The transportation task has been processed. A summary will be generated here in the future."
	fmt.Printf("\n[TransportationAgent] 任务完成，正在返回摘要: %s\n", finalSummary)

	return finalSummary, nil
}

// Execute 是 TransportationAgent 的主入口，实现了 agents.Agent 接口。
// 当大脑决定将出行相关的任务委派给它时，这个方法会被调用。
// Deprecated: This method is deprecated. Use ExecuteNew instead for better type safety.
func (a *TransportationAgent) Execute(ctx context.Context, initialQuery string, history *memory.ConversationBuffer) (summary string, err error) {
	fmt.Println("\n[TransportationAgent] 您好！我是您的出行专家，有什么可以帮您？")
	fmt.Printf("[TransportationAgent] 我收到的任务是: %s\n", initialQuery)

	// 将大脑传递的初始任务添加到记忆中
	a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.SystemChatMessage{Content: "你是一个专业的出行助手，你的任务是帮助用户查询和处理与交通、票务相关的信息。请在必要时使用工具，并在信息不足时向用户提问。"})
	a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.HumanChatMessage{Content: initialQuery})

	// 启动对话循环
	scanner := bufio.NewScanner(os.Stdin)
	for {
		// 1. 调用LLM获取回复或工具调用
		response, err := llm.GenerateResponse(ctx, a.llm, a.chatMemory, llm.MCPTools())
		if err != nil {
			fmt.Printf("\n[TransportationAgent] Error: %v\n", err)
			continue
		}

		// 2. 处理工具调用
		if len(response.ToolCalls) > 0 {
			for _, toolCall := range response.ToolCalls {
				if err := llm.HandleToolCallAndRespond(ctx, toolCall, a.llm, a.chatMemory); err != nil {
					fmt.Printf("\n[TransportationAgent] Error handling tool call: %v\n", err)
				}
			}
			continue // 工具调用后，再次循环让LLM根据工具结果生成回复
		}

		// 3. 如果没有工具调用，直接打印AI回复
		fmt.Printf("AI: %s\n", response.Content)
		a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.AIChatMessage{Content: response.Content})

		// 4. 获取用户下一步输入
		fmt.Print("You: ")
		if !scanner.Scan() {
			break
		}
		userInput := strings.TrimSpace(scanner.Text())
		if userInput == "quit" {
			break // 暂时用 'quit' 来结束对话并返回摘要
		}
		if userInput == "" {
			continue
		}
		a.chatMemory.ChatHistory.AddMessage(ctx, langchainllm.HumanChatMessage{Content: userInput})
	}

	// 5. 任务完成，生成摘要
	// TODO: 使用LLM根据完整的对话历史生成更智能的摘要
	finalSummary := "The transportation task has been processed. A summary will be generated here in the future."
	fmt.Printf("\n[TransportationAgent] 任务完成，正在返回摘要: %s\n", finalSummary)

	return finalSummary, nil
}

// 确保 TransportationAgent 实现了 agents.Agent 接口。
var _ agents.Agent = (*TransportationAgent)(nil)
