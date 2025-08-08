import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
    // 读取项目根目录环境变量（即使 root 设置为子目录）
    const rootEnv = loadEnv(mode, process.cwd(), '');
    const AMAP_KEY = rootEnv.VITE_AMAP_KEY || '';
    const AMAP_SEC = rootEnv.VITE_AMAP_SECURITY_CODE || '';

    return {
        plugins: [react()],
        root: 'src/renderer',
        publicDir: '../../public',
        define: {
            __VITE_IS_WEB__: JSON.stringify(rootEnv.VITE_IS_WEB === 'true'),
            __VITE_AMAP_KEY__: JSON.stringify(AMAP_KEY),
            __VITE_AMAP_SECURITY_CODE__: JSON.stringify(AMAP_SEC),
        },
        css: {
            postcss: {
                plugins: [require('tailwindcss'), require('autoprefixer')],
            },
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
                '@main': path.resolve(__dirname, 'src/main'),
                '@services': path.resolve(__dirname, 'src/main/services'),
                '@shared': path.resolve(__dirname, 'src/shared'),
                '@ai': path.resolve(__dirname, 'src/ai'),
                '@integrations': path.resolve(__dirname, 'src/integrations'),
                '@lib': path.resolve(__dirname, 'src/lib'),
                '@renderer': path.resolve(__dirname, 'src/renderer'),
                '@hooks': path.resolve(__dirname, 'src/renderer/hooks'),
                '@components': path.resolve(__dirname, 'src/renderer/components'),
                '@config': path.resolve(__dirname, 'config'),
            },
        },
        server: {
            port: 3000,
            host: true,
            proxy: {
                '/api': {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    secure: false,
                },
            },
        },
        build: {
            outDir: '../../dist-web',
            emptyOutDir: true,
            rollupOptions: {
                input: 'index.html',
            },
        },
    };
});
