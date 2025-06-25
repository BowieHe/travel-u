package agents

import (
	"context"

	"github.com/tmc/langchaingo/memory"
)

// Agent 定义了我们系统中所有代理（无论是大脑还是专家）都必须实现的标准接口。
// 这种统一的接口使得大脑可以以相同的方式调用任何专家，实现了系统的可扩展性。
type Agent interface {
	// Execute 是每个Agent的入口点。
	// 对于大脑来说，这是整个对话流程的开始。
	// 对于专家来说，这是大脑委派任务时调用的方法。
	//
	// ctx: 用于控制请求的上下文，例如超时或取消。
	// initialQuery: 用户的原始查询或大脑优化后的任务指令。
	// history: 共享的对话历史，使得专家也能了解之前的对话内容。
	//
	// 返回值:
	// summary: 专家Agent完成任务后，向上级（大脑）汇报的成果摘要。
	// err: 如果在执行过程中发生错误，则返回error。
	Execute(ctx context.Context, initialQuery string, history *memory.ConversationBuffer) (summary string, err error)
}
