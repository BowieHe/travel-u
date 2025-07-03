import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseLLM } from "./base";
import { ChatDeepSeek } from "@langchain/deepseek";

export class DeepSeek extends BaseLLM {
    public static override getLLM(
        model: string,
        apiKey: string,
        url: string,
        overrideConfig?: Record<string, any>
    ): BaseChatModel {
        const fullConfig = this.mergeConfig(url, overrideConfig);
        return new ChatDeepSeek({
            ...fullConfig,
            model: model,
            apiKey: apiKey,
            configuration: {
                baseURL: process.env.DEEPSEEK_API_BASE,
                ...fullConfig?.modelSpecificConfig,
            },
        });
    }
}
