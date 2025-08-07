import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export abstract class BaseLLM {
    protected url: string;
    protected apiKey: string;

    constructor(url?: string, apiKey?: string) {
        this.url = url ? url : "";
        this.apiKey = apiKey ? apiKey : "";
    }

    abstract llm(model: string): BaseChatModel;
}
