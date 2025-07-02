import { HumanMessage } from "@langchain/core/messages";
import { initializeGraph } from "./graph";
import readline from "readline";
import { AgentState } from "./state";

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
    console.log("🚀 Starting the graph stream...");
    const stream = await graph.stream(
        { messages: [new HumanMessage(input)] },
        { recursionLimit: 100 }
    );

    for await (const output of stream) {
        const [nodeName, state] = Object.entries(output)[0] as [
            string,
            AgentState
        ];
        console.log(`\n--- Output from node: ${nodeName} ---`);
        // Print the last message in the state
        if (state.messages && state.messages.length > 0) {
            const lastMessage = state.messages[state.messages.length - 1];
            console.log(lastMessage);
        }
    }
    console.log("\n🏁 Graph stream finished.");
}

async function main() {
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
