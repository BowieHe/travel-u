import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMConfig } from "./types";

export abstract class BaseLLM {
    public static getLLM(
        model: string,
        apiKey: string,
        url: string,
        overrideConfig?: Record<string, any>
    ): BaseChatModel {
        throw new Error("getLLM method must be implemented by subclasses");
    }

    protected static mergeConfig(
        url: string,
        overrideConfig?: Record<string, any>
    ): Record<string, any> {
        const baseConfig: LLMConfig = {
            temperature: 0.9,
            streaming: true,
            maxRetries: 3,
            timeout: 15000,
        };

        return {
            ...baseConfig,
            ...overrideConfig,
            configuration: {
                baseURL: url,
                ...baseConfig.modelSpecificConfig,
                ...overrideConfig?.modelSpecificConfig,
            },
        };
    }
}
