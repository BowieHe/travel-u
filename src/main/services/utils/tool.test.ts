import { describe, it, expect } from 'vitest';
import { parseSchema } from './tool';
import { tripPlanSchema } from '../agents/trip-plan-summary';
import { TripPlan } from '../utils/agent-type';

describe('parseSchema', () => {
    it('should parse valid JSON string', () => {
        const raw = `{
            "destination": "上海",
            "departure": null,
            "startDate": null,
            "endDate": null,
            "budget": null,
            "travelers": null,
            "preferences": null,
            "itinerary": null,
            "transportation": null
        }`;

        const result = parseSchema(raw, tripPlanSchema);

        expect(result).toEqual({
            destination: '上海',
            departure: null,
            startDate: null,
            endDate: null,
            budget: null,
            travelers: null,
            preferences: null,
            itinerary: null,
            transportation: null,
        });
        expect(result as TripPlan).toBeTruthy();
    });

    it('should return default object if parsing fails', () => {
        const raw = `invalid json`;

        const result = parseSchema(raw, tripPlanSchema);

        expect(result).toEqual({
            failed: 'true',
            reasoning: '降级：解析失败默认规划',
        });
    });
});
