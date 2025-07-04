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

const ToolCallSchema = z.object({
    name: z.string(),
    args: z.record(z.unknown()),
    id: z.string().optional(),
});

const AgentStateSchema = z.object({
    messages: z.array(z.any()), // Can be refined based on actual message types
    next: z
        .union([
            z.literal("Orchestrator"),
            z.literal("Transportation"),
            z.literal("Destination"),
            z.literal("END"),
        ])
        .optional(),
});

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
        const ds = new DeepSeek();
        const deepseek = ds.llm("deepseek-chat");

        this.llm = deepseek.bindTools(this.toolNode.tools);
    }

    public async invoke(state: AgentState): Promise<Partial<AgentState>> {
        const validatedState = AgentStateSchema.parse(state);
        console.log("---ORCHESTRATOR---");
        const stream = await this.llm.stream(validatedState.messages);

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
            const validatedCalls = z
                .array(ToolCallSchema)
                .parse(finalMessage.tool_calls);
            const toolInvocations = validatedCalls.map((call) => ({
                tool: call.name,
                toolInput: call.args,
            }));

            const toolMessages = await this.toolNode.batch(toolInvocations);

            const result: Partial<AgentState> = {
                messages: [
                    ...toolMessages.map((message, i) => {
                        return new ToolMessage({
                            content: message,
                            tool_call_id: validatedCalls[i].id!,
                        });
                    }),
                ],
                next: "Orchestrator", // Loop back to orchestrator to process tool result
            };
            return AgentStateSchema.partial().parse(result);
        }

        // For now, we'll just end if no tool is called.
        // A more robust implementation would handle this case better.
        const result: Partial<AgentState> = {
            messages: [finalMessage!],
            next: "END",
        };
        return AgentStateSchema.partial().parse(result);
    }
}
