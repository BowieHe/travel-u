import * as dotenv from "dotenv";
dotenv.config();
import { HumanMessage } from "@langchain/core/messages";
import { initializeGraph } from "./graph";
import readline from "readline";
import { initFromConfig } from "./mcp/mcp-client";

// Create a readline interface for user input
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

// This is a bit of a trick to get the type of the compiled graph.
// `initializeGraph` is async, so we use `Awaited` to get the promise's resolved type.
type CompiledGraph = Awaited<ReturnType<typeof initializeGraph>>;

/**
 * Asks the user a question and returns their input.
 * @param question The question to ask the user.
 * @returns A promise that resolves to the user's input.
 */
function askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

/**
 * Runs the graph with the given input and streams the output.
 * @param graph The compiled state graph.
 * @param input The input message from the user.
 */
export async function runGraph(graph: CompiledGraph, input: string) {
    console.log("🚀 Starting the graph...");
    const finalState = await graph.invoke(
        { messages: [new HumanMessage(input)] },
        { recursionLimit: 100 }
    );

    console.log("\n🏁 Graph execution finished.");
    if (finalState.messages && finalState.messages.length > 0) {
        const lastMessage = finalState.messages[finalState.messages.length - 1];
        console.log("\n--- Final Result ---");
        console.log(lastMessage.content);
    }
}

async function main() {
    // 1. Initialize MCP Client Manager FIRST
    console.log("Initializing MCP Client Manager...");
    await initFromConfig(process.cwd(), "config", "mcp-servers.json");
    console.log("MCP Client Manager initialized successfully.");

    // 2. Then initialize the graph, which depends on the MCP tools
    console.log("Initializing graph...");
    const graph = await initializeGraph();
    console.log("Graph initialized. Welcome to the interactive agent!");
    console.log('Type "exit" to quit.');

    let running = true;
    while (running) {
        const userInput = await askQuestion("\nYou: ");
        if (userInput.toLowerCase() === "exit") {
            running = false;
            console.log("Goodbye! 👋");
        } else {
            await runGraph(graph, userInput);
        }
    }
    rl.close();
}

main().catch(console.error);
