import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src'),
            '@main': path.resolve(__dirname, 'src/main'),
            '@services': path.resolve(__dirname, 'src/main/services'),
            '@shared': path.resolve(__dirname, 'src/shared'),
            '@ai': path.resolve(__dirname, 'src/ai'),
            '@integrations': path.resolve(__dirname, 'src/integrations'),
            '@lib': path.resolve(__dirname, 'src/lib'),
            '@config': path.resolve(__dirname, 'config'),
        },
    },
    test: {
        include: ['src/**/*.{test,spec}.{ts,tsx}'],
        environment: 'node',
        globals: true,
        passWithNoTests: false,
    },
});
