import { ENV_KEYS } from "../constants/config";

/**
 * 环境变量工具函数
 */
export class EnvUtils {
	/**
	 * 获取环境变量，支持默认值
	 */
	static get(key: keyof typeof ENV_KEYS, defaultValue = ""): string {
		return process.env[ENV_KEYS[key]] || defaultValue;
	}

	/**
	 * 检查必需的环境变量是否存在
	 */
	static checkRequired(
		keys: (keyof typeof ENV_KEYS)[]
	): Record<string, boolean> {
		const result: Record<string, boolean> = {};
		keys.forEach((key) => {
			const envKey = ENV_KEYS[key];
			result[envKey] = Boolean(process.env[envKey]);
		});
		return result;
	}

	/**
	 * 获取所有环境变量状态（用于调试）
	 */
	static getAllStatus(): Record<string, string> {
		const result: Record<string, string> = {};
		(Object.entries(ENV_KEYS) as [string, string][]).forEach(
			([key, envKey]) => {
				result[key] = process.env[envKey] ? "已设置" : "未定义";
			}
		);
		return result;
	}

	/**
	 * 是否为开发环境
	 */
	static isDevelopment(): boolean {
		return process.env.NODE_ENV === "development";
	}

	/**
	 * 是否为生产环境
	 */
	static isProduction(): boolean {
		return process.env.NODE_ENV === "production";
	}
}
