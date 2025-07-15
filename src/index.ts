import * as dotenv from "dotenv";
dotenv.config({ override: true });
import { HumanMessage } from "@langchain/core/messages";
import { initializeGraph } from "@/graph";
import readline from "readline";
import { getMcpClientManager, initFromConfig } from "@/mcp/mcp-client";

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

import { BaseMessage } from "@langchain/core/messages";

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

	// Handle Ctrl+C (SIGINT) for graceful shutdown
	process.on("SIGINT", async () => {
		console.log("\nCaught interrupt signal. Shutting down gracefully...");
		await getMcpClientManager().shutdown();
		rl.close();
		process.exit(0);
	});

	// The `thread` object allows us to persist state across calls.
	const thread = { configurable: { thread_id: "conversation-1" } };

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const userInput = await askQuestion("\nYou: ");
		if (userInput.toLowerCase() === "exit") {
			console.log("Goodbye! 👋");
			await getMcpClientManager().shutdown();
			rl.close();
			break; // Exit the loop
		}

		console.log("🚀 Running the graph...");

		// By only passing the latest user input, we delegate conversation history
		// management entirely to LangGraph's checkpoint system. This avoids
		// the "double counting" of messages that caused duplication issues.
		const result = await graph.invoke(
			{ messages: [new HumanMessage(userInput)] },
			thread
		);

		// The `result.messages` will contain the full, correct history,
		// managed by the checkpoint. We can extract the last message to display.
		const lastMessage = result.messages[result.messages.length - 1];
		if (lastMessage && lastMessage.getType() === "ai") {
			console.log("\n🤖 AI:", lastMessage.content);
		} else {
			console.log("\n🏁 Graph execution finished or paused.");
		}
	}
}

main().catch(console.error);
