import { ChatOpenAI } from "@langchain/openai";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseLLM } from "./base"; // 根据你的路径修改

export class OpenAI extends BaseLLM {
    public getLLM(
        model: string,
        apiKey: string,
        url: string,
        overrideConfig?: Record<string, any>
    ): BaseChatModel {
        const fullConfig = this.mergeConfig(url, overrideConfig);
        return new ChatOpenAI({
            ...fullConfig,
            modelName: model,
            openAIApiKey: apiKey,
        });
    }
}
