import { BaseMessage } from "@langchain/core/messages";

/**
 * LangGraph 代理状态接口
 */
export interface AgentState {
	messages: BaseMessage[];
	next: string;
	tripPlan: Record<string, any>;
	memory: Record<string, any>;
	subtask: any[];
	currentTaskIndex: number;
	user_interaction_complete: boolean;
}

/**
 * 旅行计划相关类型
 */
export interface TripPlan {
	destination?: string;
	startDate?: string;
	endDate?: string;
	budget?: number;
	travelers?: number;
	preferences?: string[];
	itinerary?: ItineraryItem[];
}

export interface ItineraryItem {
	day: number;
	date: string;
	activities: Activity[];
	transportation?: Transportation;
	accommodation?: Accommodation;
}

export interface Activity {
	time: string;
	title: string;
	description: string;
	location: string;
	cost?: number;
	duration?: number;
	type:
		| "sightseeing"
		| "dining"
		| "entertainment"
		| "shopping"
		| "transportation"
		| "other";
}

export interface Transportation {
	type: "flight" | "train" | "bus" | "car" | "taxi" | "subway" | "walking";
	from: string;
	to: string;
	departureTime?: string;
	arrivalTime?: string;
	cost?: number;
	duration?: number;
	details?: string;
}

export interface Accommodation {
	name: string;
	type: "hotel" | "hostel" | "apartment" | "bnb" | "other";
	location: string;
	checkIn: string;
	checkOut: string;
	cost?: number;
	rating?: number;
}
