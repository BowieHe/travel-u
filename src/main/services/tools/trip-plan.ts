import { z } from 'zod';

export const TransportationEnum = z.enum(['flight', 'train', 'car']);
export type TransportationType = z.infer<typeof TransportationEnum>;

export interface TripInfo {
    destination?: string | null;
    // Added for alignment with trip-plan tool schema
    departure?: string | null; // 出发城市
    startDate?: string | null;
    endDate?: string | null;
    budget?: number | null;
    travelers?: number | null;
    preferences?: string[] | null;
    itinerary?: ItineraryItem[] | null;
    transportation?: string | null; // 用户明确的交通方式（不推断）
}

export const emptyTripPlan: TripInfo = {
    destination: null,
    departure: null,
    startDate: null,
    endDate: null,
    budget: null,
    travelers: null,
    preferences: null,
    itinerary: null,
    transportation: null,
};

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
    type: 'sightseeing' | 'dining' | 'entertainment' | 'shopping' | 'transportation' | 'other';
}

export interface Transportation {
    type: 'flight' | 'train' | 'bus' | 'car' | 'taxi' | 'subway' | 'walking';
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
    type: 'hotel' | 'hostel' | 'apartment' | 'bnb' | 'other';
    location: string;
    checkIn: string;
    checkOut: string;
    cost?: number;
    rating?: number;
}

// 工具函数：合并 TripPlan 对象
/**
@deprecated no longer used
*/
export function mergeTripPlan(current: TripInfo, newPart: Partial<TripInfo>): TripInfo {
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

export const tripPlanSchema = z.object({
    destination: z.string().nullable().describe('用户明确表达要去的目的地城市'),
    departure: z.string().nullable().describe('用户明确表达的出发城市。'),
    startDate: z.string().nullable().describe('用户明确提到的出发日期。'),
    endDate: z.string().nullable().describe('用户明确提到的返程日期。'),
    budget: z.number().nullable().describe('用户明确提到的预算数字。'),
    travelers: z.number().nullable().describe('用户明确提到的旅游人数。'),
    preferences: z.array(z.string()).nullable().describe('用户提到的旅游偏好,比如美食,城市风光等'),
    itinerary: z
        .array(
            z.object({
                day: z.number(),
                date: z.string(),
                activities: z.array(
                    z.object({
                        time: z.string(),
                        title: z.string(),
                        description: z.string(),
                        location: z.string(),
                        cost: z.number().optional(),
                        duration: z.number().optional(),
                        type: z.enum([
                            'sightseeing',
                            'dining',
                            'entertainment',
                            'shopping',
                            'transportation',
                            'other',
                        ]),
                    })
                ),
                transportation: z
                    .object({
                        type: z.enum([
                            'flight',
                            'train',
                            'bus',
                            'car',
                            'taxi',
                            'subway',
                            'walking',
                        ]),
                        from: z.string(),
                        to: z.string(),
                        departureTime: z.string().optional(),
                        arrivalTime: z.string().optional(),
                        cost: z.number().optional(),
                        duration: z.number().optional(),
                        details: z.string().optional(),
                    })
                    .optional(),
                accommodation: z
                    .object({
                        name: z.string(),
                        type: z.enum(['hotel', 'hostel', 'apartment', 'bnb', 'other']),
                        location: z.string(),
                        checkIn: z.string(),
                        checkOut: z.string(),
                        cost: z.number().optional(),
                        rating: z.number().optional(),
                    })
                    .optional(),
            })
        )
        .nullable(),
    transportation: z.string().nullable().describe('用户明确提到的交通方式。'),
});

export function getMissingField(tripPlan: TripInfo): string[] {
    const missingFields: string[] = [];
    if (!tripPlan.destination) missingFields.push('destination');
    if (!tripPlan.departure) missingFields.push('departure');
    // if (!tripPlan.startDate) missingFields.push('startDate');
    // if (!tripPlan.endDate) missingFields.push('endDate');
    // if (tripPlan.budget === undefined || tripPlan.budget === null) missingFields.push('budget');
    // if (!tripPlan.transportation) missingFields.push('transportation');
    // if (!tripPlan.travelers) missingFields.push('travelers');
    // if (!tripPlan.preferences) missingFields.push('preferences');

    return missingFields;
}
