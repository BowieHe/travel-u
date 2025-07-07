import { describe, it, expect, beforeEach } from "vitest";
import { interpolateEnvVars } from "../../src/utils/command";

describe("interpolateEnvVars", () => {
    beforeEach(() => {
        // 设置测试环境变量
        process.env.AMAP_WEB_API = "test_api_key";
        process.env.SECRET_TOKEN = "test_token_123";
    });

    it("成功替换单个环境变量", () => {
        const rawUrl = "https://example.com?key=${AMAP_WEB_API}";
        const result = interpolateEnvVars(rawUrl);
        expect(result).toBe("https://example.com?key=test_api_key");
    });

    it("成功替换多个环境变量", () => {
        const rawUrl =
            "https://example.com?key=${AMAP_WEB_API}&token=${SECRET_TOKEN}";
        const result = interpolateEnvVars(rawUrl);
        expect(result).toBe(
            "https://example.com?key=test_api_key&token=test_token_123"
        );
    });

    it("当环境变量未定义时应抛出错误", () => {
        const rawUrl = "https://example.com?key=${UNDEFINED_VAR}";
        expect(() => interpolateEnvVars(rawUrl)).toThrowError(
            "环境变量未定义: UNDEFINED_VAR"
        );
    });

    it("处理空字符串应返回空字符串", () => {
        const result = interpolateEnvVars("");
        expect(result).toBe("");
    });

    it("处理无环境变量的字符串应原样返回", () => {
        const rawUrl = "https://example.com/path";
        const result = interpolateEnvVars(rawUrl);
        expect(result).toBe(rawUrl);
    });
});
