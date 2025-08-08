import { Tool } from "@langchain/core/tools";
import { Gemini } from "../models/gemini";
import { z } from "zod";
import { AgentState, PlanTodo } from "../utils/agent-type";
import {
    AIMessage,
    SystemMessage,
    ToolMessage,
} from "@langchain/core/messages";
import { TRAVEL_AGENT_PROMPT } from "../prompts/prompt";
import { McpService } from "../mcp/mcp";

/**
 * Creates a todo plan using MCP
 */
const createTodoPlanSchema = z.object({
    userRequest: z.string(),
    tripDetails: z.any().optional(),
});

interface CreateTodoPlanInput {
    userRequest: string;
    tripDetails?: any;
}

const createTodoPlanFunc = async (input: CreateTodoPlanInput): Promise<string> => {
    try {
        const mcpService = McpService.getInstance();
        await mcpService.initialize();
        
        if (!mcpService.isReady()) {
            throw new Error("MCP Service not ready");
        }

        const clientManager = mcpService.getClientManager();
        
        // Call the todo planner MCP
        const result = await clientManager.callTool("todo-planner", "create_plan", {
            userRequest: input.userRequest,
            tripDetails: input.tripDetails || {},
            context: "travel_planning"
        });

        return JSON.stringify(result);
    } catch (error) {
        console.error("Error creating todo plan:", error);
        return JSON.stringify({ 
            error: error instanceof Error ? error.message : String(error),
            fallbackPlan: [
                {
                    id: "1",
                    content: "Research destination information",
                    status: "pending",
                    priority: "high",
                    category: "research"
                },
                {
                    id: "2", 
                    content: "Find and book transportation",
                    status: "pending",
                    priority: "high",
                    category: "transportation"
                },
                {
                    id: "3",
                    content: "Find and book accommodation",
                    status: "pending", 
                    priority: "high",
                    category: "accommodation"
                }
            ]
        });
    }
};

class CreateTodoPlanTool extends Tool {
    name = "create_todo_plan";
    description = "Creates a structured todo plan for travel planning based on user request and trip details. Input should be a JSON string with userRequest and optional tripDetails.";

    async _call(input: string): Promise<string> {
        try {
            const parsedInput = JSON.parse(input);
            return createTodoPlanFunc(parsedInput);
        } catch (error) {
            return createTodoPlanFunc({ userRequest: input });
        }
    }
}

export const createTodoPlanTool = new CreateTodoPlanTool();

/**
 * Creates a regular orchestrator node that handles tool calls directly.
 * This replaces the ReAct agent with a more controlled approach.
 *
 * @param tools The list of tools the agent can use, including 'create_subtask'.
 * @returns A node function that can be used in the graph.
 */
export const createOrchestrator = () => {
    const llm = new Gemini();
    const tools = [createTodoPlanTool];
    const model = llm.llm("gemini-2.5-flash").bindTools(tools);

    const systemPrompt = TRAVEL_AGENT_PROMPT;

    // Create a tool map for quick lookup
    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));

    return async (state: AgentState): Promise<Partial<AgentState>> => {
        console.log("---ORCHESTRATOR---");

        let { messages } = state;

        const tripContent = JSON.stringify(state.tripPlan, null, 2);
        const systemMessage = new SystemMessage({
            content: "你现在是一个全能的旅游助手。当用户提出旅行需求时，首先使用create_todo_plan工具为他们创建一个详细的计划清单，然后再回答用户的问题。"
        });

        // Use invoke instead of stream for tool calls
        const aiMessage = await model.invoke([systemMessage, ...messages]);
        
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

                let toolResult: string;
                
                if (toolCall.name === "create_todo_plan") {
                    const inputData = {
                        userRequest: toolCall.args.userRequest || JSON.stringify(toolCall.args),
                        tripDetails: toolCall.args.tripDetails || toolCall.args
                    };
                    toolResult = await createTodoPlanFunc(inputData);
                } else {
                    console.warn("calling the unexpected tool:", toolCall.name);
                    toolResult = "";
                }

                const toolMessage = new ToolMessage({
                    tool_call_id: toolCall.id ?? "",
                    content: toolResult,
                });

                // Parse the plan result and add to state
                let planTodos: PlanTodo[] = [];
                try {
                    const planResult = JSON.parse(toolResult);
                    if (planResult.fallbackPlan) {
                        planTodos = planResult.fallbackPlan;
                    } else if (planResult.plan) {
                        planTodos = planResult.plan;
                    } else if (Array.isArray(planResult)) {
                        planTodos = planResult;
                    }
                } catch (parseError) {
                    console.error("Error parsing plan result:", parseError);
                }

                console.log("Created plan todos:", planTodos);

                return {
                    messages: [aiMessage, toolMessage],
                    planTodos: planTodos,
                    user_interaction_complete: false,
                    next: "ask_user",
                };
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

        // If no tool calls, proceed with streaming response
        const streamResult = await model.stream([systemMessage, ...messages]);
        
        let fullContent = "";
        
        // 收集流式响应内容
        for await (const chunk of streamResult) {
            if (chunk.content) {
                fullContent += chunk.content;
                console.log("Orchestrator streaming chunk:", chunk.content);
            }
        }
        
        // 创建完整的 AI 消息
        const finalAiMessage = new AIMessage({
            content: fullContent,
        });
        
        return {
            messages: [finalAiMessage],
            user_interaction_complete: false,
            next: "ask_user",
        };

        /*
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

                // // 根据工具名称进行类型安全的调用
                // if (toolCall.name === "create_subtask") {
                //     const args = toolCall.args as CreateSubtaskInput;
                //     toolResult = await (
                //         tool.func as (
                //             input: CreateSubtaskInput
                //         ) => Promise<string>
                //     )(args);
                // } else if (toolCall.name === "generate_task_prompt") {
                //     const args = toolCall.args as GenerateTaskPromptInput;
                //     toolResult = await (
                //         tool.func as (
                //             input: GenerateTaskPromptInput
                //         ) => Promise<string>
                //     )(args);
                // } else if (toolCall.name === "collect_user_info") {
                //     const args = toolCall.args as CollectUserInfoInput;
                //     toolResult = await (
                //         tool.func as (
                //             input: CollectUserInfoInput
                //         ) => Promise<string>
                //     )(args);
                // } else {
                //     // todo)) might need to be deleted in future
                //     console.warn("calling the unexpected tool:", toolCall.name);
                //     toolResult = "";
                // }

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
        */
    };
};

const createTaskSchema = z.object({
    topic: z.string(),
    destination: z.string(),
    departure_date: z.string(),
    origin: z.string(),
});

type CreateSubtaskInput = {
    topic: string;
    destination: string;
    departure_date: string;
    origin: string;
};

// export const createSubtaskTool = new DynamicStructuredTool({
//     name: "create_subtask",
//     description:
//         "Creates a subtask with the collected information when all fields are present.",
//     schema: createTaskSchema,
//     func: async (input: CreateSubtaskInput): Promise<string> => {
//         // The tool's function is just to return the structured data.
// const generateTaskSchema = z.object({
//     task_prompt_for_expert_agent: z.object({
//         role_definition: z.string(),
//         core_goal: z.string(),
//         input_data: z.object({
//             origin: z.string(),
//             destination: z.string(),
//             date: z.string(),
//         }),
//         output_requirements: z.object({
//             format: z.string(),
//             constraints: z.array(z.string()),
//         }),
//         user_persona: z.string(),
//     }),
// });

// type GenerateTaskPromptInput = {
//     task_prompt_for_expert_agent: {
//         role_definition: string;
//         core_goal: string;
//         input_data: {
//             origin: string;
//             destination: string;
//             date: string;
//         };
//         output_requirements: {
//             format: string;
//             constraints: string[];
//         };
//         user_persona: string;
//     };
// };

// // 2. Define the task generation tool with structured output
// export const generateTaskPromptTool = new DynamicStructuredTool({
// const collectUserInfoSchema = z.object({
//     reason: z.string(),
//     missing_fields: z.array(z.string()),
// });

// type CollectUserInfoInput = {
//     reason: string;
//     missing_fields: string[];
// };

// // 3. Define the user interaction tool - simplified to return routing instruction
// export const collectUserInfoTool = new DynamicStructuredTool({
//     name: "collect_user_info",
//     description:
//         "Signals that user interaction is needed to collect missing travel information.",
//     schema: collectUserInfoSchema,
//     func: async (input: CollectUserInfoInput): Promise<string> => {
//         console.log("Orchestrator requesting user interaction:", input.reason);

//         return JSON.stringify({
//             action: "request_user_interaction",
//             reason: input.reason,
//             missing_fields: input.missing_fields,
//             message: `User interaction needed: ${input.reason}`,
//         });
//     },
// });

// // 定义类型
// type CreateSubtaskInput = z.infer<typeof createTaskSchema>;
// type GenerateTaskPromptInput = z.infer<typeof generateTaskSchema>;
// type CollectUserInfoInput = z.infer<typeof collectUserInfoSchema>;
