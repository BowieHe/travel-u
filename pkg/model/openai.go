package model

import (
	"fmt"

	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/BowieHe/travel-u/pkg/utils"
	"github.com/tmc/langchaingo/llms/openai"
)

// use deepseek for debug so far
func GetOpenAI(options types.LLMOption) (*openai.LLM, error) {
	llm, err := openai.New(
		openai.WithToken(utils.GetEnv("OPENAI_API_KEY", "")),
		openai.WithModel("deepseek-chat"),
		openai.WithBaseURL(utils.GetEnv("OPENAI_URL", "https://api.deepseek.com/v1")),
	)
	if err != nil {
		logger.Get().Error().Err(err).Msg("failed to create the llm client")
		return nil, fmt.Errorf("failed to create the llm client: %v", err)
	}

	return llm, nil
}
