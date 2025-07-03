import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseLLM } from "./base";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export class DeepSeek extends BaseLLM {
    public getLLM(
        model: string,
        apiKey: string,
        url: string,
        overrideConfig?: Record<string, any>
    ): BaseChatModel {
        const fullConfig = this.mergeConfig(url, overrideConfig);
        return new ChatGoogleGenerativeAI({
            ...fullConfig,
            model: model,
            apiKey: apiKey,
            baseUrl: url,
        });
    }
}
