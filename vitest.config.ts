import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    // 独立于 vite.config.ts，避免其中 root: 'src/renderer' 把测试根目录改掉
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@main': path.resolve(__dirname, 'src/main'),
            '@services': path.resolve(__dirname, 'src/main/services'),
        },
    },
    test: {
        include: ['src/**/*.{test,spec}.ts'],
        environment: 'node',
        globals: true,
        // 可选: 提示不存在测试立即失败
        passWithNoTests: false,
    },
});
