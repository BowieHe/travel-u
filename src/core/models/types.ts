// types.ts 或统一定义处
export type LLMConfig = {
    temperature?: number;
    streaming?: boolean;
    maxRetries?: number;
    timeout?: number;
    modelSpecificConfig?: Record<string, any>;
};
