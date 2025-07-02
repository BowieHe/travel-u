import { HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../state";
import { Specialist } from "./specialist";

export class Destination extends Specialist {
	async invoke(state: AgentState): Promise<Partial<AgentState>> {
		console.log("---DESTINATION AGENT---");
		// 在未来的任务中，这里会调用工具来查询目的地信息
		return {
			messages: [
				new HumanMessage("Destination Agent finished its task."),
			],
			next: "Orchestrator",
		};
	}
}
