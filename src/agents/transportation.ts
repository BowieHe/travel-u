import { HumanMessage } from "@langchain/core/messages";
import { AgentState } from "../state";
import { Specialist } from "./specialist";

export class Transportation extends Specialist {
	async invoke(state: AgentState): Promise<Partial<AgentState>> {
		console.log("---TRANSPORTATION AGENT---");
		// 在未来的任务中，这里会调用工具来查询交通信息
		return {
			messages: [
				new HumanMessage("Transportation Agent finished its task."),
			],
			next: "Orchestrator", // 将控制权交还给大脑
		};
	}
}
