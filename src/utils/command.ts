import { execSync } from "child_process";
import { accessSync, constants } from "fs";

export function resolveCommandPath(command: string): string | null {
    try {
        // 方法1：使用 which/where 命令（跨平台）
        const cmd = process.platform === "win32" ? "where" : "which";
        const path = execSync(`${cmd} ${command}`, { encoding: "utf8" }).trim();

        // 验证路径有效性
        accessSync(path, constants.X_OK);
        return path;
    } catch {
        // 方法2：回退到 PATH 环境变量扫描
        const pathEntries = (process.env.PATH || "").split(":");
        for (const entry of pathEntries) {
            const fullPath = `${entry}/${command}`;
            try {
                accessSync(fullPath, constants.X_OK);
                return fullPath;
            } catch {}
        }
        return null;
    }
}

export function interpolateEnvVars(rawString: string): string {
    // 匹配 ${ANY_ENV_VAR} 的正则表达式
    const envVarRegex = /\$\{([^}]+)\}/g;
    return rawString.replace(envVarRegex, (match, envVarName) => {
        const value = process.env[envVarName];
        if (value === undefined) {
            throw new Error(`环境变量未定义: ${envVarName}`);
        }
        return value;
    });
}
