import { BaseLLM } from "./base";
import { ChatDeepSeek } from "@langchain/deepseek";

export class DeepSeek extends BaseLLM {
    // private url?: string;
    // private apiKey?: string;

    constructor(url?: string, apiKey?: string) {
        const dsUrl = url ? url : process.env.DS_URL;
        const dsAPI = apiKey ? apiKey : process.env.DS_API_KEY;
        super(dsUrl, dsAPI);
    }

    public llm(model: string): ChatDeepSeek {
        return new ChatDeepSeek({
            model: model,
            apiKey: this.apiKey,
            configuration: {
                baseURL: this.url,
            },
        });
    }
}
