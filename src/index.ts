import { HumanMessage } from "@langchain/core/messages";
import { graph } from "./graph";

async function main() {
	console.log("🚀 Starting the graph stream...");

	const stream = await graph.stream(
		{ messages: [new HumanMessage("查询去北京的交通")] },
		{ recursionLimit: 100 }
	);

	for await (const output of stream) {
		// @ts-ignore
		const [nodeName, state] = Object.entries(output)[0];
		console.log(`\n--- Output from node: ${nodeName} ---`);
		console.log(state);
	}

	console.log("\n🏁 Graph stream finished.");
}

main().catch(console.error);
