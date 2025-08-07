import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    root: "src/renderer", // 改为使用 renderer 目录作为根目录
    publicDir: "../../public", // 调整 public 目录路径
    define: {
        __VITE_IS_WEB__: JSON.stringify(process.env.VITE_IS_WEB === 'true'),
    },
    css: {
        postcss: {
            plugins: [
                require('tailwindcss'),
                require('autoprefixer'),
            ],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@main": path.resolve(__dirname, "src/main"),
            "@services": path.resolve(__dirname, "src/main/services"),
            "@shared": path.resolve(__dirname, "src/shared"),
            "@ai": path.resolve(__dirname, "src/ai"),
            "@integrations": path.resolve(__dirname, "src/integrations"),
            "@lib": path.resolve(__dirname, "src/lib"),
            "@renderer": path.resolve(__dirname, "src/renderer"),
            "@hooks": path.resolve(__dirname, "src/renderer/hooks"),
            "@components": path.resolve(__dirname, "src/renderer/components"),
            "@config": path.resolve(__dirname, "config"),
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
        outDir: "../../dist-web", // 调整输出目录路径
        emptyOutDir: true,
        rollupOptions: {
            input: "index.html" // 明确指定入口文件
        }
    },
});
