import { z } from "zod";

export const TransportationEnum = z.enum(["flight", "train", "car"]);
export type TransportationType = z.infer<typeof TransportationEnum>;

// 改回 interface
export interface TripPlan {
	destination?: string;
	departure?: string;
	startDate?: string;
	endDate?: string;
	transportation?: TransportationType;
	budget?: number;
}

// 工具函数：合并 TripPlan 对象
export function mergeTripPlan(
	current: TripPlan,
	newPart: Partial<TripPlan>
): TripPlan {
	const merged = { ...current };

	for (const key in newPart) {
		if (newPart.hasOwnProperty(key)) {
			const value = (newPart as any)[key];
			// 只有当新值不是 undefined 且不是 null 时才进行更新
			if (value !== undefined && value !== null) {
				(merged as any)[key] = value;
			}
		}
	}

	return merged;
}

// 工具函数：检查 TripPlan 是否完整
export function isTripPlanComplete(tripPlan: TripPlan): boolean {
	const requiredFields = ["destination", "departure", "startDate"];
	return requiredFields.every((field) => {
		const value = (tripPlan as any)[field];
		return (
			value !== undefined &&
			value !== null &&
			(typeof value !== "string" || value.trim() !== "")
		);
	});
}

// 工具函数：创建 TripPlan 的 Zod Schema
export function getTripPlanSchema() {
	return z.object({
		destination: z.string().optional().describe("用户希望前往的目的地。"),
		departure: z.string().optional().describe("用户的出发城市或地点。"),
		startDate: z
			.string()
			.optional()
			.describe(
				"旅行的开始日期，可以是自然语言描述（如 '下个月', '七月十五号'）。"
			),
		endDate: z
			.string()
			.optional()
			.describe(
				"旅行的结束日期或持续时间（如 '一周', '七月二十二号'）。"
			),
		budget: z
			.number()
			.optional()
			.describe("旅行的大致预算，请尝试提取数字。"),
		transportation: TransportationEnum.optional().describe(
			"用户偏好的交通方式（如 '飞机', '火车', '汽车'）。"
		),
	});
}

// 工具函数：将 TripPlan 转换为 memory 格式
export function convertTripPlanToMemory(
	tripPlan: TripPlan
): Record<string, any> {
	const memory: Record<string, any> = {};

	if (tripPlan.destination) memory.destination = tripPlan.destination;
	if (tripPlan.departure) memory.origin = tripPlan.departure; // 注意：departure -> origin
	if (tripPlan.startDate) memory.departure_date = tripPlan.startDate; // 注意：startDate -> departure_date
	if (tripPlan.endDate) memory.end_date = tripPlan.endDate;
	if (tripPlan.budget) memory.budget = tripPlan.budget;
	if (tripPlan.transportation)
		memory.transportation = tripPlan.transportation;

	return memory;
}
