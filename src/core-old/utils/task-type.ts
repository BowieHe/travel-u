/**
 * @interface IOutputRequirements
 * @description 定义了所有任务通用的输出要求结构。
 */
export interface IOutputRequirements {
	format: string;
	constraints: string[];
}

/**
 * @interface IBaseExpertPrompt
 * @description 定义了所有专家任务提示的通用基础结构，不包含变化的 `input_data`。
 */
export interface IBaseExpertPrompt {
	role_definition: string;
	core_goal: string;
	output_requirements: IOutputRequirements;
	user_persona: string;
}

// --- 为每种任务类型定义具体的 input_data 结构 ---

/**
 * @interface ITransportationInputData
 * @description 交通规划任务所需的输入数据。
 */
export interface ITransportationInputData {
	origin: string;
	destination: string;
	date: string;
}

/**
 * @interface IAttractionInputData
 * @description 景点规划任务所需的输入数据。
 */
export interface IAttractionInputData {
	destination: string;
	date: string;
}

/**
 * @interface IFoodInputData
 * @description 美食推荐任务所需的输入数据。
 */
export interface IFoodInputData {
	destination: string;
}

export enum TaskType {
	/** 交通规划任务 */
	Transportation = "transportation_planning",

	/** 景点规划任务 */
	Attraction = "attraction_planning",

	/** 美食推荐任务 */
	Food = "food_recommendation",
}
/**
 * @interface ITransportationTask
 * @description 交通规划任务的完整定义。
 */
export interface ITransportationTask {
	task_type: TaskType;
	task_prompt_for_expert_agent: IBaseExpertPrompt & {
		input_data: ITransportationInputData;
	};
}

/**
 * @interface IAttractionTask
 * @description 景点规划任务的完整定义。
 */
export interface IAttractionTask {
	task_type: TaskType;
	task_prompt_for_expert_agent: IBaseExpertPrompt & {
		input_data: IAttractionInputData;
	};
}

/**
 * @interface IFoodTask
 * @description 美食推荐任务的完整定义。
 */
export interface IFoodTask {
	task_type: TaskType;
	task_prompt_for_expert_agent: IBaseExpertPrompt & {
		input_data: IFoodInputData;
	};
}

/**
 * @type AnyExpertTask
 * @description 一个可辨识联合类型，可以代表三种任务中的任意一种。
 * 这是你在函数参数或变量类型中最常使用的类型。
 */
export type AnyExpertTask = ITransportationTask | IAttractionTask | IFoodTask;
