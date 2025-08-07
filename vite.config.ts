import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
    plugins: [react()],
    root: ".",
    publicDir: "public",
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
    },
    build: {
        outDir: "dist-web",
        emptyOutDir: true,
    },
});
