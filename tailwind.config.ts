import type { Config } from "tailwindcss";

export default {
	content: [
		"./src/renderer/**/*.{html,js,ts,tsx}",
		"./src/**/*.{html,js,ts,tsx}",  // 添加更广泛的路径匹配
	],
	theme: {
		extend: {
			colors: {
				// Travel-U 主题色
				travel: {
					cream: "#FFFDF6", // 奶白色 - 主要背景色
					light: "#FAF6E9", // 浅米色 - 次要背景色
					accent: "#DDEB9D", // 淡绿色 - 边框/装饰色
					primary: "#A0C878", // 主绿色 - 主要操作色
				},
			},
		},
	},
	plugins: [],
} satisfies Config;
