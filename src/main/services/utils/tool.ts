import { ZodSchema } from 'zod';

export function parseSchema<T>(raw: string, schema: ZodSchema<T>): T {
    // 首先尝试直接 JSON.parse
    const directTry = () => {
        try {
            return schema.parse(JSON.parse(raw));
        } catch {
            return null;
        }
    };
    let parsed: T | null = directTry();
    if (!parsed) {
        // 提取首个 JSON 花括号
        const match = raw.match(/\{[\s\S]*?\}/);
        if (match) {
            try {
                parsed = schema.parse(JSON.parse(match[0]));
            } catch {
                /* ignore */
            }
        }
    }
    return (
        parsed ||
        ({
            failed: 'true',
            reasoning: '降级：解析失败默认规划',
        } as T)
    );
}
