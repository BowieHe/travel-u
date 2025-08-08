import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

export default {
    darkMode: 'class',
    content: [
        './src/renderer/**/*.{html,js,ts,tsx}',
        './src/**/*.{html,js,ts,tsx}', // 添加更广泛的路径匹配
    ],
    theme: {
        extend: {
            keyframes: {
                chatIn: {
                    '0%': { opacity: '0', transform: 'translateY(4px) scale(.96)' },
                    '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
            },
            animation: {
                'chat-in': 'chatIn 220ms ease-out',
            },
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
                    // 暗色模式映射
                    darkSurface: '#1f1f1c',
                    darkBorder: '#3a3a32',
                    darkDivider: '#2c2c26',
                    darkIcon: '#b8b3a6',
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
                '.markdown-body h1': {
                    fontSize: '1.25rem',
                    fontWeight: '600',
                    margin: '0.75rem 0 0.5rem',
                },
                '.markdown-body h2': {
                    fontSize: '1.1rem',
                    fontWeight: '600',
                    margin: '0.65rem 0 0.4rem',
                },
                '.markdown-body p': { margin: '0.4rem 0', lineHeight: '1.55' },
                '.markdown-body ul': {
                    listStyle: 'disc',
                    paddingLeft: '1.25rem',
                    margin: '0.4rem 0',
                },
                '.markdown-body ol': {
                    listStyle: 'decimal',
                    paddingLeft: '1.25rem',
                    margin: '0.4rem 0',
                },
                '.markdown-body code': {
                    background: 'rgba(0,0,0,0.06)',
                    padding: '0.15rem 0.35rem',
                    borderRadius: '4px',
                    fontSize: '0.85em',
                },
                '.markdown-body pre': {
                    background: '#222',
                    color: '#eee',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    overflowX: 'auto',
                    fontSize: '0.8rem',
                },
                '.markdown-body pre code': {
                    background: 'transparent',
                    padding: '0',
                    color: 'inherit',
                },
                '.markdown-body a': { color: '#4d7c0f', textDecoration: 'underline' },
                '.dark .markdown-body code': { background: 'rgba(255,255,255,0.08)' },
                '.dark .markdown-body pre': { background: '#2c2c2a' },
            });
        }),
    ],
} satisfies Config;
