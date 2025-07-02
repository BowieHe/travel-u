import { Specialist } from "./specialist";
import { DynamicTool } from "@langchain/core/tools";

export class Destination extends Specialist {
    constructor(tool: DynamicTool) {
        // The 'invoke' logic is now handled by the Specialist base class.
        super(tool);
    }
}
