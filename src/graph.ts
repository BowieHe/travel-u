import {
    START,
    END,
    StateGraph,
    StateGraphArgs,
    interrupt,
} from "@langchain/langgraph";
import { MemorySaver } from "@langchain/langgraph-checkpoint";
import { AgentState } from "@/state";
import { createOrchestrator } from "@/agents/orchestrator";
import { AIMessage, BaseMessage, ToolMessage } from "@langchain/core/messages";
import { createMcpTools } from "@/mcp/mcp-tools";
import { createSpecialistAgent } from "@/agents/specialist";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { subtaskParserNode } from "@/agents/subtask-parser";
// import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { extractAndParseJSON } from "@/utils/json-parser";
import {
    createSubtaskTool,
    generateTaskPromptTool,
} from "@/agents/orchestrator";
import { AnyExpertTask } from "@/utils/task-type";
import { TaskType } from "@/utils/task-type";
import { createSummarizer } from "./agents/summarizer";

/**
 * Router for the Orchestrator.
 * Decides whether to call tools, wait for user input, or route to the specialist flow.
 * This preserves the original function's return values.
 */
const orchestratorRouter = (
    state: AgentState
): "create_subtask" | "ask_user" => {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    const msg = lastMessage.content.toString();
    if (msg.includes("task_prompt") || msg.includes("task_type")) {
        console.log("Creating subtasks for following tasks:", msg);
        return "create_subtask";
    }

    // If no tool calls, it's asking the user for information
    console.log("Orchestrator is asking user for information");
    return "ask_user";
};

const subtaskRouter = (
    state: AgentState
): "transportation_specialist" | "destination_specialist" | "summary" => {
    if (state.next === TaskType.Transportation) {
        return "transportation_specialist";
    } else if (
        state.next === TaskType.Attraction ||
        state.next === TaskType.Food
    ) {
        return "destination_specialist";
    } else {
        console.warn("Unknown task type in subtaskRouter:", state.next);
        return "summary";
    }
};

/**
 * Router for the Specialists.
 * This function is called *after* the `create_subtask` tool has been executed.
 * It directs the flow to the correct specialist based on the tool's output.
 */
const specialistRouter = (
    state: AgentState
): "transportation_specialist" | "destination_specialist" | "END" => {
    console.log("---ROUTING TO SPECIALIST---");
    const lastMessage = state.messages[state.messages.length - 1];

    if (
        lastMessage instanceof ToolMessage &&
        lastMessage.name === "create_subtask"
    ) {
        // Use the robust JSON parser to handle various formats
        const subtask = extractAndParseJSON<AnyExpertTask>(
            lastMessage.content.toString()
        );

        if (subtask) {
            switch (subtask.task_type) {
                case TaskType.Transportation:
                    console.log(`Routing to: ${subtask.task_type}`);
                    return "transportation_specialist";
                case TaskType.Attraction:
                    console.log(`Routing to: ${subtask.task_type}`);
                    return "destination_specialist";
                default:
                    console.warn(
                        "Unknown task type from create_subtask tool:",
                        subtask.task_type
                    );
                    return "END";
            }
        }
    }

    // Default return to ensure all code paths return a value
    console.log("No valid subtask found, ending.");
    return "END";
};

/**
 * Decides what to do after a tool has been executed.
 * This is the core of the new simplified logic.
 */
const afterToolsRouter = (state: AgentState): string => {
    const lastMessage = state.messages[state.messages.length - 1];
    // Check if the last action was the creation of a subtask.
    if (
        lastMessage instanceof ToolMessage &&
        lastMessage.name === "create_subtask"
    ) {
        // If so, delegate to the specialist router to find the next node.
        return specialistRouter(state);
    }

    // Check if the last action was generating a task prompt
    if (
        lastMessage instanceof ToolMessage &&
        lastMessage.name === "generate_task_prompt"
    ) {
        // Parse the task prompt to determine routing
        try {
            const taskPrompt = JSON.parse(lastMessage.content.toString());
            const inputData =
                taskPrompt.task_prompt_for_expert_agent.input_data;

            // Create a subtask-like object for routing
            const routingData = {
                topic: taskPrompt.task_prompt_for_expert_agent.role_definition.includes(
                    "交通"
                )
                    ? "transportation"
                    : "destination",
                origin: inputData.origin,
                destination: inputData.destination,
                departure_date: inputData.date,
            };

            console.log(
                `Routing based on task prompt to: ${routingData.topic}`
            );
            if (routingData.topic === "transportation") {
                return "transportation_specialist";
            }
            if (routingData.topic === "destination") {
                return "destination_specialist";
            }
        } catch (e) {
            console.error("Failed to parse task prompt for routing:", e);
        }
        return "END";
    }

    // Otherwise, it was a regular tool call, so we loop back to the orchestrator.
    return "orchestrator";
};

/**
 * A simple router that decides whether a specialist should call tools or end its turn.
 */
const specialistDecision = (
    state: AgentState
): "call_specialist_tools" | "END" => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (
        lastMessage instanceof AIMessage &&
        lastMessage.tool_calls &&
        lastMessage.tool_calls.length > 0
    ) {
        return "call_specialist_tools";
    }
    return "END";
};

export const initializeGraph = async () => {
    const { tools: mcpTools } = await createMcpTools();

    const orchestratorTools = [
        ...mcpTools["time"],
        createSubtaskTool,
        generateTaskPromptTool,
    ];
    const orchestratorToolNode = new ToolNode(orchestratorTools);

    // 2. Create the orchestrator agent (the ReAct agent executor)
    const orchestrator = createOrchestrator(orchestratorTools);
    const summarizer = createSummarizer();

    // 3. Create specialist agents and their tool nodes
    const transportTools = [
        ...mcpTools["12306-mcp"],
        ...mcpTools["variflight"],
    ];
    const destinationTools = [...mcpTools["amap-maps"], ...mcpTools["fetch"]];

    const transportationSpecialist = createSpecialistAgent(
        transportTools,
        "You are a transportation specialist..."
    );
    const destinationSpecialist = createSpecialistAgent(
        destinationTools,
        "You are a destination specialist..."
    );

    const transportationToolNode = new ToolNode(transportTools);
    const destinationToolNode = new ToolNode(destinationTools);

    // 4. Define the graph state. We need to define all channels to match AgentState.
    const graphState: StateGraphArgs<AgentState>["channels"] = {
        messages: {
            value: (x: BaseMessage[], y: BaseMessage[]) => {
                const oldContent = new Set(x.map((msg) => msg.content));
                const newMsg = y.filter((msg) => !oldContent.has(msg.content));
                return [...x, ...newMsg];
            },
            default: () => [],
        },
        next: {
            value: (_x, y) => y,
            default: () => "orchestrator",
        },
        subtask: {
            value: (_x, y) => y,
            default: () => [],
        },
        currentTaskIndex: {
            value: (_x, y) => y,
            default: () => -1,
        },
        memory: {
            value: (x, y) => ({ ...x, ...y }),
            default: () => ({}),
        },
        current_specialist: {
            value: (x, y) => y ?? x,
            default: () => "END",
        },
        error_message: {
            value: (_x, y) => y, // 直接用新值替换
            default: () => undefined,
        },
    };

    // 5. Build the graph with the new, clean architecture
    const workflow = new StateGraph<AgentState>({ channels: graphState })
        // === Nodes ===
        .addNode("orchestrator", orchestrator)
        .addNode("subtask_parser", subtaskParserNode) // Add the subtask parser node
        // .addNode("tool_executor", orchestratorToolNode) // A single node for all orchestrator tools
        .addNode("transportation_specialist", transportationSpecialist)
        // .addNode("transportation_tools", transportationToolNode)
        .addNode("destination_specialist", destinationSpecialist)
        // .addNode("destination_tools", destinationToolNode)
        .addNode("wait_user", interrupt)
        .addNode("summarizer", summarizer)

        // === Edges ===
        .addEdge(START, "orchestrator")

        // --- Phase 1: Orchestrator Loop ---
        .addConditionalEdges("orchestrator", orchestratorRouter, {
            create_subtask: "subtask_parser",
            ask_user: "wait_user",
        })

        // --- Phase 2: Routing after tool execution ---
        // After the tool_executor runs, this router decides the next step.
        .addConditionalEdges("subtask_parser", subtaskRouter, {
            transportation_specialist: "transportation_specialist",
            destination_specialist: "destination_specialist",
            summary: "summarizer",
        })

        // // --- Specialist Execution ---
        // .addConditionalEdges("transportation_specialist", specialistDecision, {
        //     call_specialist_tools: "transportation_tools",
        //     END: "subtask_parser",
        // })
        // .addConditionalEdges("destination_specialist", specialistDecision, {
        //     call_specialist_tools: "destination_tools",
        //     END: "subtask_parser",
        // })
        .addEdge("transportation_specialist", "subtask_parser")
        .addEdge("destination_specialist", "subtask_parser")
        .addEdge("summarizer", END);

    // After the specialist tools run, the graph finishes.
    // .addEdge("transportation_tools", "subtask_parser")
    // .addEdge("destination_tools", "subtask_parser");

    // 6. Compile and return the graph
    const checkpointer = new MemorySaver();
    const graph = workflow.compile({ checkpointer });
    return graph;
};
