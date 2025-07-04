import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { AgentState, AgentNode } from "../state";
import { RunnableAgent } from "./base";
import { DynamicTool } from "@langchain/core/tools";
import {
    ChatPromptTemplate,
    MessagesPlaceholder,
} from "@langchain/core/prompts";
import { DeepSeek } from "../models/deepseek";
import { JsonOutputToolsParser } from "@langchain/core/output_parsers/openai_tools";
import { Runnable } from "@langchain/core/runnables";

export class Specialist extends RunnableAgent {
    private agent: Runnable;
    private specialistName: AgentNode;
    private tool: DynamicTool;

    constructor(tool: DynamicTool, specialistName: AgentNode) {
        super();
        this.tool = tool;
        this.specialistName = specialistName;

        const prompt = ChatPromptTemplate.fromMessages([
            new MessagesPlaceholder("messages"),
        ]);
        const llm = new DeepSeek().llm("deepseek-chat");
        const toolLlm = llm.bindTools([this.tool]);
        this.agent = prompt.pipe(toolLlm).pipe(new JsonOutputToolsParser());
    }

    public async invoke(state: AgentState): Promise<Partial<AgentState>> {
        const lastMessage = state.messages[state.messages.length - 1];

        // If the last message is a tool message, it means the specialist just executed a tool.
        // Now, it needs to decide the next step.
        if (lastMessage instanceof ToolMessage) {
            const response = await this.agent.invoke({
                messages: state.messages,
            });

            // If the LLM returns a tool call, it means the specialist needs to continue.
            // Otherwise, it's a final answer to the user.
            const aiMessage = new AIMessage({
                content: response.content || "",
                tool_calls: response.tool_calls,
            });

            // The 'next' node is determined by whether there are more tool calls.
            const nextNode =
                response.tool_calls && response.tool_calls.length > 0
                    ? this.specialistName
                    : "Orchestrator";

            return {
                messages: [aiMessage],
                next: nextNode,
            };
        }

        // Initial invocation from the orchestrator
        const toolCall = (lastMessage as AIMessage).tool_calls![0];
        if (toolCall.name !== this.tool.name) {
            throw new Error(
                `Tool mismatch: Expected ${this.tool.name}, got ${toolCall.name}`
            );
        }

        const toolOutput = await this.tool.invoke(toolCall.args);
        const toolMessage = new ToolMessage({
            tool_call_id: toolCall.id!,
            content: toolOutput,
        });

        // After executing the tool, invoke the agent again to decide the next step.
        const newState = {
            ...state,
            messages: [...state.messages, toolMessage],
        };
        return this.invoke(newState);
    }
}
