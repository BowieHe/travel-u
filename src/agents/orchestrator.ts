import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { AgentState } from "../state";
import { RunnableAgent } from "./base";
import { ChatOpenAI } from "@langchain/openai";
import { ToolExecutor } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { Runnable } from "@langchain/core/runnables";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatOpenAICallOptions } from "@langchain/openai/dist/chat_models";

const openAIModel = new ChatOpenAI({
    model: "deepseek-chat",
    temperature: 0.9,
    streamUsage: true,
    configuration: {
        baseURL: process.env.OPENAI_URL,
        apiKey: process.env.OPENAI_API_KEY,
    },
});

export class Orchestrator extends RunnableAgent {
    private llm: Runnable<
        BaseLanguageModelInput,
        AIMessageChunk,
        ChatOpenAICallOptions
    >;
    private toolExecutor: ToolExecutor;

    constructor(toolExecutor: ToolExecutor) {
        super();
        this.toolExecutor = toolExecutor;
        this.llm = openAIModel.bind({
            tools: this.toolExecutor.tools,
            // We can use Zod to define a schema for the output.
            // But we can also use the model's tool calling capabilities.
        });
    }

    public async invoke(state: AgentState): Promise<Partial<AgentState>> {
        console.log("---ORCHESTRATOR---");

        const response = await this.llm.invoke(state.messages);

        // If the model decides to call a tool, it will be in the tool_calls property.
        if (response.tool_calls && response.tool_calls.length > 0) {
            const toolInvocations = response.tool_calls.map((call) => ({
                tool: call.name,
                toolInput: call.args,
            }));

            const toolMessages = await this.toolExecutor.batch(toolInvocations);

            return {
                messages: [
                    ...toolMessages.map((message, i) => {
                        return new ToolMessage({
                            content: message,
                            tool_call_id: response.tool_calls![i].id!,
                        });
                    }),
                ],
                next: "Orchestrator", // Loop back to orchestrator to process tool result
            };
        }

        // For now, we'll just end if no tool is called.
        // A more robust implementation would handle this case better.
        return {
            messages: [response],
            next: "END",
        };
    }
}
