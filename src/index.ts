import * as dotenv from "dotenv";
dotenv.config({ override: true });
import { HumanMessage } from "@langchain/core/messages";
import { initializeGraph } from "@/graph/graph";
import readline from "readline";
import { getMcpClientManager, initFromConfig } from "@/mcp/mcp-client";
import { Command } from "@langchain/langgraph";

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

	// 用于跟踪当前是否有待处理的中断
	let pendingInterrupt = false;

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

		let result;

		if (pendingInterrupt) {
			// 如果有待处理的中断，使用 Command({ resume: userInput }) 恢复执行
			console.log("📤 恢复图的执行，传入用户输入...");
			result = await graph.invoke(
				new Command({ resume: userInput }),
				thread
			);
			pendingInterrupt = false; // 重置中断标志
		} else {
			// 正常启动图的执行
			console.log("🆕 开始新的图执行...");
			result = await graph.invoke(
				{ messages: [new HumanMessage(userInput)] },
				thread
			);
		}

		// 检查是否有中断
		if (result.__interrupt__) {
			console.log("⏸️  图被中断，等待用户输入...");
			console.log("中断信息:", result.__interrupt__);
			pendingInterrupt = true; // 设置中断标志

			// 显示AI的问题（如果有的话）
			if (result.messages && result.messages.length > 0) {
				const lastMessage = result.messages[result.messages.length - 1];
				if (lastMessage && lastMessage.getType() === "ai") {
					console.log("\n🤖 AI:", lastMessage.content);
				}
			}
		} else {
			// 正常完成，显示结果
			const lastMessage = result.messages[result.messages.length - 1];
			if (lastMessage && lastMessage.getType() === "ai") {
				console.log("\n🤖 AI:", lastMessage.content);
			} else {
				console.log("\n🏁 Graph execution finished.");
			}
		}
	}
}

main().catch(console.error);
