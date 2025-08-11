import { z } from 'zod';

// Unified schema for orchestrator / directAnswer / planner output.
// Keep in one place to avoid divergence.
export const PLAN_JSON_SCHEMA = z.object({
    thinking: z.string().optional(),
    direct_answer: z.string().optional(),
    plan: z
        .array(
            z.object({
                description: z.string(),
                category: z
                    .enum([
                        'research',
                        'booking',
                        'transportation',
                        'accommodation',
                        'activity',
                        'other',
                    ])
                    .optional(),
                priority: z.enum(['high', 'medium', 'low']).optional(),
            })
        )
        .optional(),
});

export type PlanJson = z.infer<typeof PLAN_JSON_SCHEMA>;
