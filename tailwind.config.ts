import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

export default {
    content: [
        './src/renderer/**/*.{html,js,ts,tsx}',
        './src/**/*.{html,js,ts,tsx}', // 添加更广泛的路径匹配
    ],
    theme: {
        extend: {
            colors: {
                // Travel-U 主题色
                travel: {
                    cream: '#FFFDF6', // 奶白色 - 主要背景色
                    light: '#FAF6E9', // 浅米色 - 次要背景色
                    accent: '#DDEB9D', // 淡绿色 - 边框/装饰色
                    primary: '#A0C878', // 主绿色 - 主要操作色
                },
                brand: {
                    icon: '#8c8c6a', // 图标/次级文字
                    border: '#dcd9d3', // 输入框等边框
                    divider: '#eae8e2', // 分割线
                    surface: '#faf9f5', // 面板背景 (原始 #faf9f5)
                    gradientFrom: '#aaa',
                    gradientTo: '#666',
                },
            },
            fontFamily: {
                app: [
                    'Inter',
                    '-apple-system',
                    'BlinkMacSystemFont',
                    'Segoe UI',
                    'Roboto',
                    'Helvetica',
                    'Arial',
                    'sans-serif',
                ],
            },
        },
    },
    plugins: [
        plugin(function ({ addUtilities }) {
            addUtilities({
                '.chat-panel': {
                    height: 'calc(100vh - 40px)', // 20px * 2 外边距等效高度
                },
            });
        }),
    ],
} satisfies Config;
