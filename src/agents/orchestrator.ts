import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { AgentState } from "../state";
import { Tool } from "@langchain/core/tools";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";
import { DeepSeek } from "@/models/deepseek";

/**
 * The orchestrator is responsible for deciding which tool to call.
 */
export const createOrchestrator = (
    tools: Tool[]
): Runnable<AgentState, Partial<AgentState>> => {
    const ds = new DeepSeek();
    const model = ds.llm("deepseek-chat").bindTools(tools);

    return new RunnableLambda({
        func: async (state: AgentState): Promise<Partial<AgentState>> => {
            console.log("---ORCHESTRATOR---");

            const stream = await model.stream(state.messages);

            let finalMessage: AIMessageChunk | null = null;
            process.stdout.write("\n--- Output from node: Orchestrator ---\n");
            for await (const chunk of stream) {
                if (
                    chunk.additional_kwargs &&
                    chunk.additional_kwargs.reasoning_content
                ) {
                    process.stdout.write(
                        chunk.additional_kwargs.reasoning_content as string
                    );
                }

                if (chunk.content) {
                    process.stdout.write(chunk.content as string);
                }
                if (finalMessage === null) {
                    finalMessage = chunk;
                } else {
                    finalMessage = finalMessage.concat(chunk);
                }
            }
            process.stdout.write("\n");

            const message = new AIMessage({
                content: finalMessage?.content ?? "",
                tool_calls: finalMessage?.tool_calls ?? [],
            });

            const toolCalls = message.tool_calls ?? [];
            if (toolCalls.length > 0) {
                const toolName = toolCalls[0].name;
                console.log(`Orchestrator decided to call tool: ${toolName}`);
                return {
                    next_tool: toolName,
                };
            }

            return {
                messages: [message],
                next_tool: null,
            };
        },
    }).withConfig({
        runName: "Orchestrator",
    });
};
