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
        destination: z
            .string()
            .optional()
            .describe(
                "用户明确表达要去的目的地城市。只有当用户明确说'去XX'、'到XX'时才填写。"
            ),
        departure: z
            .string()
            .optional()
            .describe(
                "用户明确表达的出发城市。只有当用户明确说'从XX出发'、'XX出发'时才填写。"
            ),
        startDate: z
            .string()
            .optional()
            .describe(
                "用户明确提到的出发日期。只有当用户明确提供日期信息时才填写。"
            ),
        endDate: z
            .string()
            .optional()
            .describe(
                "用户明确提到的返程日期。只有当用户明确提供结束日期时才填写。"
            ),
        budget: z
            .number()
            .optional()
            .describe(
                "用户明确提到的预算数字。只有当用户明确提供预算金额时才填写。"
            ),
        transportation: TransportationEnum.optional().describe(
            "用户明确提到的交通方式。只有当用户明确说'坐飞机'、'坐火车'、'开车'等时才填写。绝对不要推断。"
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

export function getMissingField(tripPlan: TripPlan): string[] {
    const missingFields: string[] = [];
    if (!tripPlan.destination) missingFields.push("destination");
    if (!tripPlan.departure) missingFields.push("departure");
    if (!tripPlan.startDate) missingFields.push("startDate");
    if (!tripPlan.endDate) missingFields.push("endDate");
    if (tripPlan.budget === undefined || tripPlan.budget === null)
        missingFields.push("budget");
    if (!tripPlan.transportation) missingFields.push("transportation");

    return missingFields;
}
