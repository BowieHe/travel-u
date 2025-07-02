package destination

import (
	"context"

	"github.com/BowieHe/travel-u/internal/agents"
	"github.com/tmc/langchaingo/memory"
)

// DestinationAgent 是我们的“目的地专家”。
// 它专门处理与目的地信息相关的任务，如推荐餐厅、景点、酒店等。
type DestinationAgent struct {
	// 在未来的实现中，这里可以包含专家需要的依赖，
	// 例如一个LLM的客户端实例和它自己的专业工具集。
}

// New 创建一个新的 DestinationAgent 实例。
func New() *DestinationAgent {
	return &DestinationAgent{}
}

// Execute 是 DestinationAgent 的主入口，实现了 agents.Agent 接口。
// 当大脑决定将目的地相关的任务委派给它时，这个方法会被调用。
func (a *DestinationAgent) Execute(ctx context.Context, initialQuery string, history *memory.ConversationBuffer) (summary string, err error) {
	// TODO: 在这里实现目的地专家的核心逻辑：
	// 1. 分析大脑传递过来的任务指令(initialQuery)。
	// 2. 如果需要，与用户进行对话以澄清偏好（例如：“您喜欢什么口味的菜？”）。
	// 3. 调用自己的专业工具（例如 `recommend_restaurants`）。
	// 4. 任务完成后，生成一个简洁的结果摘要。
	// 5. 将摘要作为 summary 返回给大脑。

	// 临时返回，表示任务已接收。
	return "DestinationAgent received the task. Implementation pending.", nil
}

// 确保 DestinationAgent 实现了 agents.Agent 接口。
var _ agents.Agent = (*DestinationAgent)(nil)
