import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		resolve: {
			alias: {
				"@": resolve(__dirname, "src-new"),
				"@main": resolve(__dirname, "src-new/main"),
				"@shared": resolve(__dirname, "src-new/shared"),
				"@core": resolve(__dirname, "src-new/core"),
				"@config": resolve(__dirname, "config"),
			},
		},
		build: {
			rollupOptions: {
				input: resolve(__dirname, "src-new/main/index.ts"),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		resolve: {
			alias: {
				"@": resolve(__dirname, "src-new"),
				"@main": resolve(__dirname, "src-new/main"),
				"@shared": resolve(__dirname, "src-new/shared"),
				"@core": resolve(__dirname, "src-new/core"),
				"@config": resolve(__dirname, "config"),
			},
		},
		build: {
			rollupOptions: {
				input: resolve(__dirname, "src-new/preload/index.ts"),
			},
		},
	},
	renderer: {
		root: "src-new/renderer",
		resolve: {
			alias: {
				"@": resolve(__dirname, "src-new"),
				"@renderer": resolve(__dirname, "src-new/renderer"),
				"@shared": resolve(__dirname, "src-new/shared"),
				"@hooks": resolve(__dirname, "src-new/renderer/hooks"),
				"@components": resolve(
					__dirname,
					"src-new/renderer/components"
				),
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
				input: resolve(__dirname, "src-new/renderer/index.html"),
			},
		},
	},
});
