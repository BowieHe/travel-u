import { AgentState } from "../state";
import { Tool, DynamicStructuredTool } from "@langchain/core/tools";
import { RunnableLambda, Runnable } from "@langchain/core/runnables";
import { DeepSeek } from "@/models/deepseek";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

/**
 * The orchestrator is responsible for deciding which tool to call.
 * It uses a ReAct agent to reason and act.
 */
export const createOrchestrator = (
	tools: (Tool | DynamicStructuredTool)[]
): Runnable<AgentState, Partial<AgentState>> => {
	const ds = new DeepSeek();
	const model = ds.llm("deepseek-chat");

	const agent = createReactAgent({
		llm: model,
		tools: tools as Tool[],
	});

	return new RunnableLambda({
		func: async (state: AgentState): Promise<Partial<AgentState>> => {
			console.log("---ORCHESTRATOR---");
			const result = await agent.invoke(state);
			return {
				messages: result.messages,
				next_tool: null, // ReAct agent handles all tool calls internally
			};
		},
	}).withConfig({ runName: "Orchestrator" });
};

/*
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { AgentState } from "../state";
import { Tool } from "@langchain/core/tools";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";
import { DeepSeek } from "@/models/deepseek";

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
*/
