import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
// 类型定义
export type LLMModelType =
    | "deepseek-reasoner"
    | "gpt-4-turbo"
    | "azure-gpt-4"
    | "anthropic-claude"
    | "google-gemini";

type LLMServiceConfig = {
    temperature?: number;
    streaming?: boolean;
    maxRetries?: number;
    timeout?: number;
    modelSpecificConfig?: Record<string, any>;
};
export class LLMService {
    private static instance: LLMService;
    private models = new Map<string, BaseChatModel>();
    private constructor() {}
    public static getInstance(): LLMService {
        if (!LLMService.instance) {
            LLMService.instance = new LLMService();
        }
        return LLMService.instance;
    }
    public getModel(
        modelType: LLMModelType,
        config?: LLMServiceConfig
    ): BaseChatModel {
        const cacheKey = `${modelType}-${JSON.stringify(config)}`;

        if (this.models.has(cacheKey)) {
            return this.models.get(cacheKey)!;
        }
        const baseConfig = {
            temperature: config?.temperature ?? 0.7,
            streaming: config?.streaming ?? true,
            maxRetries: config?.maxRetries ?? 3,
            timeout: config?.timeout ?? 15000,
        };
        let model: BaseChatModel;
        switch (modelType) {
            case "deepseek-reasoner":
                model = new ChatDeepSeek({
                    ...baseConfig,
                    model: "deepseek-reasoner",
                    apiKey: process.env.DEEPSEEK_API_KEY,
                    configuration: {
                        baseURL: process.env.DEEPSEEK_API_BASE,
                        ...config?.modelSpecificConfig,
                    },
                });
                break;
            case "gpt-4-turbo":
                model = new ChatOpenAI({
                    ...baseConfig,
                    modelName: "gpt-4-turbo-preview",
                    openAIApiKey: process.env.OPENAI_API_KEY,
                    configuration: {
                        baseURL: process.env.OPENAI_API_BASE,
                        ...config?.modelSpecificConfig,
                    },
                });
                break;
            case "google-gemini":
                model = new ChatGoogleGenerativeAI({
                    ...baseConfig,
                    model: "gemini-pro", // 或 gemini-1.5-pro，如果你开通了新版本
                    apiKey: process.env.GOOGLE_API_KEY,
                    ...config?.modelSpecificConfig,
                });
                break;
            default:
                throw new Error(`Unsupported model type: ${modelType}`);
        }
        this.models.set(cacheKey, model);
        return model;
    }
}
