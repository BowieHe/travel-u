import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tailwindcss from "tailwindcss";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		resolve: {
			alias: {
				"@": resolve(__dirname, "src"),
			},
		},
		build: {
			rollupOptions: {
				input: resolve(
					import.meta.dirname || __dirname,
					"src/main/main.ts"
				),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		resolve: {
			alias: {
				"@": resolve(__dirname, "src"),
			},
		},
		build: {
			rollupOptions: {
				input: resolve(
					import.meta.dirname || __dirname,
					"src/preload/preload.ts"
				),
			},
		},
	},
	renderer: {
		root: "src/renderer",
		resolve: {
			alias: {
				"@": resolve(__dirname, "src"),
			},
		},
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
