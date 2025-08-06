import { ChatOpenAI } from "@langchain/openai";
import { BaseLLM } from "./base"; // 根据你的路径修改

export class OpenAI extends BaseLLM {
    constructor(url?: string, apiKey?: string) {
        const openUrl = url ? url : process.env.OPENAI_URL;
        const openAPI = apiKey ? apiKey : process.env.OPENAI_API_KEY;
        super(openUrl, openAPI);
    }

    public llm(model: string): ChatOpenAI {
        return new ChatOpenAI({
            model: model,
            openAIApiKey: this.apiKey,
            configuration: {
                baseURL: this.url,
            },
        });
    }
}
