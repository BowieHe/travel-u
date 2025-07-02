import { AgentState } from "../state";

export abstract class RunnableAgent {
	public abstract invoke(state: AgentState): Promise<Partial<AgentState>>;
}
