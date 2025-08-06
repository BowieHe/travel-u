import { BaseLLM } from "./base";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export class Gemini extends BaseLLM {
	constructor(url?: string, apiKey?: string) {
		const geminiUrl = url ? url : process.env.GEMINI_URL;
		const geminiKey = apiKey ? apiKey : process.env.GEMINI_API_KEY;
		super(geminiUrl, geminiKey);
	}

	public llm(model: string): ChatGoogleGenerativeAI {
		return new ChatGoogleGenerativeAI({
			model: model,
			apiKey: this.apiKey,
			baseUrl: this.url,
		});
	}
}
