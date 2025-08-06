import { DynamicStructuredTool } from "@langchain/core/tools";
import { Gemini } from "../models/gemini";
import { z } from "zod";
import { AgentState } from "../types/type";
import {
	AIMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import { TRAVEL_AGENT_PROMPT } from "./prompt";

/**
 * Creates a regular orchestrator node that handles tool calls directly.
 * This replaces the ReAct agent with a more controlled approach.
 *
 * @param tools The list of tools the agent can use, including 'create_subtask'.
 * @returns A node function that can be used in the graph.
 */
export const createOrchestrator = () => {
	const llm = new Gemini();
	const tools = [
		// ...externalTools,
		createSubtaskTool,
		generateTaskPromptTool,
		collectUserInfoTool,
	];
	const model = llm.llm("gemini-2.5-flash").bindTools(tools);

	const systemPrompt = TRAVEL_AGENT_PROMPT;

	// Create a tool map for quick lookup
	const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

	return async (state: AgentState): Promise<Partial<AgentState>> => {
		console.log("---ORCHESTRATOR---");

		let { messages } = state;

		const tripContent = JSON.stringify(state.tripPlan, null, 2);
		const systemMessage = new SystemMessage({
			content: systemPrompt.replace("{trip_plan}", tripContent),
		});

		// Invoke the model with system message and conversation history
		const result = await model.invoke([systemMessage, ...messages]);
		const aiMessage = result as AIMessage;

		console.log("Orchestrator AI response:", aiMessage.content);

		// Handle tool calls if present
		if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
			const toolCall = aiMessage.tool_calls[0];
			const tool = toolMap.get(toolCall.name);

			if (!tool) {
				console.error(`Tool ${toolCall.name} not found`);
				return {
					messages: [aiMessage],
					errorMessage: `Tool ${toolCall.name} not found`,
				};
			}

			try {
				console.log(
					`Orchestrator calling tool: ${toolCall.name}`,
					toolCall.args
				);

				// For collect_user_info tool, pass the current state
				let toolResult: string;

				// 根据工具名称进行类型安全的调用
				if (toolCall.name === "create_subtask") {
					const args = toolCall.args as CreateSubtaskInput;
					toolResult = await (
						tool.func as (
							input: CreateSubtaskInput
						) => Promise<string>
					)(args);
				} else if (toolCall.name === "generate_task_prompt") {
					const args = toolCall.args as GenerateTaskPromptInput;
					toolResult = await (
						tool.func as (
							input: GenerateTaskPromptInput
						) => Promise<string>
					)(args);
				} else if (toolCall.name === "collect_user_info") {
					const args = toolCall.args as CollectUserInfoInput;
					toolResult = await (
						tool.func as (
							input: CollectUserInfoInput
						) => Promise<string>
					)(args);
				} else {
					// todo)) might need to be deleted in future
					console.warn("calling the unexpected tool:", toolCall.name);
					toolResult = "";
				}

				const toolMessage = new ToolMessage({
					tool_call_id: toolCall.id ?? "",
					content: toolResult,
				});

				// Handle different tool types
				if (toolCall.name === "generate_task_prompt") {
					console.log(
						"Orchestrator generated task prompt, moving to subtask creation"
					);
					return {
						messages: [aiMessage, toolMessage],
						next: "subtask_parser",
					};
				} else if (toolCall.name === "create_subtask") {
					console.log(
						"Orchestrator created subtask, ready for routing"
					);
					const subtaskData = JSON.parse(toolResult);
					return {
						messages: [aiMessage, toolMessage],
						subtask: [subtaskData],
						next: "router",
					};
				} else if (toolCall.name === "collect_user_info") {
					console.log("Orchestrator requesting user interaction");
					return {
						messages: [aiMessage, toolMessage],
						user_interaction_complete: false,
						next: "ask_user",
					};
				} else {
					console.log(
						"Orchestrator called utility tool, continuing conversation"
					);
					return {
						messages: [aiMessage, toolMessage],
						next: "orchestrator",
					};
				}
			} catch (error: any) {
				console.error(`Error calling tool ${toolCall.name}:`, error);
				const errorMessage = new ToolMessage({
					tool_call_id: toolCall.id ?? "",
					content: `Error: ${error.message}`,
				});
				return {
					messages: [aiMessage, errorMessage],
					errorMessage: error.message,
				};
			}
		}

		// If AI responds without tool calls, force user interaction
		console.log(
			"WARNING: AI responded without tool calls, forcing user interaction"
		);
		console.log("AI response content:", aiMessage.content);

		// Force user interaction by setting the appropriate state
		return {
			messages: [aiMessage],
			user_interaction_complete: false,
			next: "ask_user",
		};
	};
};

const createTaskSchema = z.object({
	topic: z
		.string()
		.describe(
			"The topic of the request, inferred from the user's intent. Should be one of: 'transportation', 'destination'."
		),
	destination: z.string().describe("The final destination."),
	departure_date: z.string().describe("The machine-readable departure date."),
	origin: z.string().describe("The starting point of the journey."),
});
export const createSubtaskTool = new DynamicStructuredTool({
	name: "create_subtask",
	description:
		"Creates a subtask with the collected information when all fields are present.",
	schema: createTaskSchema,
	func: async (input) => {
		// The tool's function is just to return the structured data.
		return JSON.stringify(input);
	},
});

const generateTaskSchema = z.object({
	task_prompt_for_expert_agent: z.object({
		role_definition: z
			.string()
			.describe("The role definition for the specialist agent"),
		core_goal: z
			.string()
			.describe("The core goal description for the task"),
		input_data: z.object({
			origin: z.string().describe("The starting point of the journey"),
			destination: z.string().describe("The final destination"),
			date: z.string().describe("The departure date"),
		}),
		output_requirements: z.object({
			format: z
				.string()
				.describe("The format instructions for the output"),
			constraints: z
				.array(z.string())
				.describe("List of constraints for the output"),
		}),
		user_persona: z.string().describe("Description of the user persona"),
	}),
});
// 2. Define the task generation tool with structured output
export const generateTaskPromptTool = new DynamicStructuredTool({
	name: "generate_task_prompt",
	description:
		"Generates a structured task prompt for the specialist agent when all required information is collected.",
	schema: generateTaskSchema,
	func: async (input) => {
		// Return the structured task prompt
		return JSON.stringify(input);
	},
});

const collectUserInfoSchema = z.object({
	reason: z
		.string()
		.describe(
			"The reason for collecting user information (e.g., 'missing destination information')"
		),
	missing_fields: z
		.array(z.string())
		.describe("List of missing fields that need to be collected"),
});
// 3. Define the user interaction tool - simplified to return routing instruction
export const collectUserInfoTool = new DynamicStructuredTool({
	name: "collect_user_info",
	description:
		"Signals that user interaction is needed to collect missing travel information.",
	schema: collectUserInfoSchema,
	func: async (input) => {
		console.log("Orchestrator requesting user interaction:", input.reason);

		return JSON.stringify({
			action: "request_user_interaction",
			reason: input.reason,
			missing_fields: input.missing_fields,
			message: `User interaction needed: ${input.reason}`,
		});
	},
});

// 定义类型
type CreateSubtaskInput = z.infer<typeof createTaskSchema>;
type GenerateTaskPromptInput = z.infer<typeof generateTaskSchema>;
type CollectUserInfoInput = z.infer<typeof collectUserInfoSchema>;
