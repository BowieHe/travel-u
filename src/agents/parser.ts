import { BaseMessage, AIMessage, HumanMessage } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Runnable, RunnableLambda } from "@langchain/core/runnables";
import { OpenAI } from "../models/openai";
import { AgentState } from "../state";

const PARSER_SYSTEM_PROMPT = `You are an expert at converting user input into a JSON object.
You will be given a user's query, a tool's description, and the tool's JSON schema.
Your task is to extract the parameters from the user's query and format them into a valid JSON object that matches the provided schema.

Generate ONLY the JSON object containing the extracted parameters. Do not include any other text or explanations.`;

export const createParserAgent = (
    toolName: string,
    toolDescription: string,
    toolSchema: object
): Runnable<AgentState, Partial<AgentState>> => {
    const model = new OpenAI().llm("gpt-4.1-mini");

    const prompt = ChatPromptTemplate.fromMessages([
        ["system", PARSER_SYSTEM_PROMPT],
        [
            "human",
            "User Input: {userInput}\\nTool Description: {toolDescription}\\nTool JSON Schema: {toolSchema}",
        ],
    ]);

    const runnable = new RunnableLambda({
        func: async (state: AgentState) => {
            // Find the latest HumanMessage by searching backwards.
            const humanMessage = [...state.messages]
                .reverse()
                .find(
                    (msg): msg is HumanMessage => msg instanceof HumanMessage
                );

            if (!humanMessage) {
                throw new Error("No HumanMessage found in the state.");
            }
            const userInput = humanMessage.content;

            const chain = prompt.pipe(model);

            const response = await chain.invoke({
                userInput: userInput,
                toolDescription: toolDescription,
                toolSchema: JSON.stringify(toolSchema, null, 2),
            });

            const args = JSON.parse(response.content as string);
            const toolCall = {
                name: toolName,
                args: args,
                id: `tool_call_${toolName}_${Date.now()}`,
            };

            return {
                messages: [
                    new AIMessage({
                        content: "",
                        tool_calls: [toolCall],
                    }),
                ],
            };
        },
    }).withConfig({
        runName: "ParserAgent",
    });

    return runnable;
};
