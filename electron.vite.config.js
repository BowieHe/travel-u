import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: resolve(process.cwd(), "src/main.ts"),
			},
		},
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
		build: {
			rollupOptions: {
				input: resolve(process.cwd(), "src/preload.ts"),
			},
		},
	},
	renderer: {
		root: "src/renderer",
		build: {
			rollupOptions: {
				input: resolve(process.cwd(), "src/renderer/index.html"),
			},
		},
		css: {
			postcss: {
				plugins: ["tailwindcss"],
			},
		},
	},
});
