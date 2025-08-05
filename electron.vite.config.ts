import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "tailwindcss";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: resolve(import.meta.dirname || __dirname, "src/main.ts"),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: resolve(
					import.meta.dirname || __dirname,
					"src/preload.ts"
				),
			},
		},
	},
	renderer: {
		root: "src/renderer",
		build: {
			rollupOptions: {
				input: resolve(
					import.meta.dirname || __dirname,
					"src/renderer/index.html"
				),
			},
		},
		css: {
			postcss: {
				plugins: [tailwindcss],
			},
		},
	},
});
