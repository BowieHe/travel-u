import { ToolMessage } from "@langchain/core/messages";
import { AgentState } from "../state";
import { RunnableAgent } from "./base";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { Runnable } from "@langchain/core/runnables";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessageChunk } from "@langchain/core/messages";
import { BaseChatModelCallOptions } from "@langchain/core/language_models/chat_models";
import { DeepSeek } from "@/models/deepseek";

export class Orchestrator extends RunnableAgent {
    private llm: Runnable<
        BaseLanguageModelInput,
        AIMessageChunk,
        BaseChatModelCallOptions
    >;
    private toolNode: ToolNode;

    constructor(toolNode: ToolNode) {
        super();
        this.toolNode = toolNode;

        const deepseek = DeepSeek.getLLM(
            "deepseek-reasoner",
            process.env.OPENAI_API_KEY!,
            process.env.OPENAI_URL!
        );

        if (!deepseek.bindTools) {
            throw new Error(
                "The selected LLM does not support the .bindTools() method."
            );
        }
        // The modern, correct way to attach tools to a model for tool-calling
        // is to use the .bindTools() method. This ensures the model is aware
        // of the tools' schemas and can decide when to call them.
        this.llm = deepseek.bindTools(this.toolNode.tools);
    }

    public async invoke(state: AgentState): Promise<Partial<AgentState>> {
        console.log("---ORCHESTRATOR---");
        const stream = await this.llm.stream(state.messages);

        let finalMessage: AIMessageChunk | null = null;
        process.stdout.write("\n--- Output from node: Orchestrator ---\n");
        for await (const chunk of stream) {
            // The reasoning content is streamed in the `additional_kwargs`.
            // We must check for it and print it to see the model's thought process.
            if (
                chunk.additional_kwargs &&
                chunk.additional_kwargs.reasoning_content
            ) {
                process.stdout.write(
                    chunk.additional_kwargs.reasoning_content as string
                );
            }

            // Also stream the main content, which is the final answer.
            if (chunk.content) {
                process.stdout.write(chunk.content as string);
            }
            // 2. Aggregate the final message
            if (finalMessage === null) {
                finalMessage = chunk;
            } else {
                finalMessage = finalMessage.concat(chunk);
            }
        }
        process.stdout.write("\n");

        // If the model decides to call a tool, it will be in the tool_calls property.
        if (
            finalMessage &&
            finalMessage.tool_calls &&
            finalMessage.tool_calls.length > 0
        ) {
            const toolInvocations = finalMessage.tool_calls.map((call) => ({
                tool: call.name,
                toolInput: call.args,
            }));

            const toolMessages = await this.toolNode.batch(toolInvocations);

            return {
                messages: [
                    ...toolMessages.map((message, i) => {
                        return new ToolMessage({
                            content: message,
                            tool_call_id: finalMessage!.tool_calls![i].id!,
                        });
                    }),
                ],
                next: "Orchestrator", // Loop back to orchestrator to process tool result
            };
        }

        // For now, we'll just end if no tool is called.
        // A more robust implementation would handle this case better.
        return {
            messages: [finalMessage!],
            next: "END",
        };
    }
}
