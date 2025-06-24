package model

import (
	"github.com/BowieHe/travel-u/pkg/logger"
	"github.com/BowieHe/travel-u/pkg/types"
	"github.com/BowieHe/travel-u/pkg/utils"
	"github.com/tmc/langchaingo/llms/openai"
)

// use deepseek for debug so far
func GetOpenAI(opts types.LLMOption) (*openai.LLM, error) {
	// dummyTool definition removed as openai.WithTools is not valid for openai.New()
	// Tools will be passed to GenerateContent in the service layer.

	llm, err := openai.New(
		openai.WithToken(utils.GetEnv("OPENAI_API_KEY", "")),
		// openai.WithModel("gemini-2.5-pro-preview-06-05-thinking"),
		openai.WithModel("deepseek-reasoner"), // Ensure this model supports tool/function calling
		// openai.WithBaseURL(utils.GetEnv("OPENAI_URL", "https://api.deepseek.com/v1/chat/completions")),
		openai.WithBaseURL(utils.GetEnv("OPENAI_URL", "https://api.ai-wave.org")),

		// openai.WithTools removed
	)
	if err != nil {
		logger.Get().Error().Err(err).Msg("failed to create the llm client")
		return nil, err
	}

	return llm, nil
}
