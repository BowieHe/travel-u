import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

export default defineConfig({
    main: {
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
                "@main": resolve(__dirname, "src/main"),
                "@shared": resolve(__dirname, "src/shared"),
                "@ai": resolve(__dirname, "src/ai"),
                "@integrations": resolve(__dirname, "src/integrations"),
                "@lib": resolve(__dirname, "src/lib"),
                "@config": resolve(__dirname, "config"),
            },
        },
        build: {
            sourcemap: true,
            minify: false,
            rollupOptions: {
                input: resolve(__dirname, "src/main/index.ts"),
            },
        },
    },
    preload: {
        plugins: [externalizeDepsPlugin()],
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
                "@main": resolve(__dirname, "src/main"),
                "@shared": resolve(__dirname, "src/shared"),
                "@ai": resolve(__dirname, "src/ai"),
                "@integrations": resolve(__dirname, "src/integrations"),
                "@lib": resolve(__dirname, "src/lib"),
                "@config": resolve(__dirname, "config"),
            },
        },
        build: {
            sourcemap: true,
            minify: false,
            rollupOptions: {
                input: resolve(__dirname, "src/preload/index.ts"),
            },
        },
    },
    renderer: {
        root: "src/renderer",
        resolve: {
            alias: {
                "@": resolve(__dirname, "src"),
                "@renderer": resolve(__dirname, "src/renderer"),
                "@shared": resolve(__dirname, "src/shared"),
                "@ai": resolve(__dirname, "src/ai"),
                "@integrations": resolve(__dirname, "src/integrations"),
                "@lib": resolve(__dirname, "src/lib"),
                "@hooks": resolve(__dirname, "src/renderer/hooks"),
                "@components": resolve(__dirname, "src/renderer/components"),
            },
        },
        plugins: [react()],
        css: {
            postcss: {
                plugins: [tailwindcss()],
            },
        },
        build: {
            sourcemap: true,
            minify: false,
            rollupOptions: {
                input: resolve(__dirname, "src/renderer/index.html"),
            },
        },
    },
});
