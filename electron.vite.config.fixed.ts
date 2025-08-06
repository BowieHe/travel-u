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
				"@core": resolve(__dirname, "src/core"),
				"@config": resolve(__dirname, "config"),
			},
		},
		build: {
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
				"@core": resolve(__dirname, "src/core"),
				"@config": resolve(__dirname, "config"),
			},
		},
		build: {
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
			rollupOptions: {
				input: resolve(__dirname, "src/renderer/index.html"),
			},
		},
	},
});
