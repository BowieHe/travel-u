# BrowserView API 使用文档

## 概述

这个项目的BrowserView系统提供了一个完整的浏览器功能，支持页面导航、DOM内容提取和AI分析。

## 主要功能

### 1. 基础浏览器操作
- 页面导航和URL输入
- 前进/后退/刷新/首页
- 快捷访问旅游网站
- 页面加载状态显示

### 2. DOM内容提取
- 自动提取页面主要内容
- 结构化数据：标题、链接、图片、文章内容
- 支持手动触发提取

### 3. AI内容分析
- 侧边栏展示提取的内容
- 页面概要、重要标题、关键链接
- 可发送给AI进行深度分析

## API 使用方法

### 从Main进程控制BrowserView

#### 1. 基础导航操作

```typescript
// 在main进程中
import { BrowserViewManager } from './services/browser-view-manager';

// 获取BrowserViewManager实例（通过主窗口）
const browserViewManager = new BrowserViewManager(mainWindow);

// 创建BrowserView
await browserViewManager.createBrowserView();

// 显示BrowserView
const bounds = { x: 0, y: 120, width: 800, height: 600 };
await browserViewManager.showBrowserView(bounds);

// 导航到指定URL
await browserViewManager.navigateToUrl('https://www.xiaohongshu.com');
```

#### 2. 通过IPC从Renderer进程控制

```typescript
// 在renderer进程中（React组件）
// 创建BrowserView
await window.electronAPI.browserViewCreate();

// 显示BrowserView
const bounds = { x: 0, y: 120, width: 800, height: 600 };
await window.electronAPI.browserViewShow(bounds);

// 导航到页面
await window.electronAPI.browserViewNavigate('https://www.ctrip.com');

// 提取DOM内容
await window.electronAPI.browserViewExtractDOM();
```

#### 3. 监听BrowserView事件

```typescript
// 监听页面信息更新
window.electronAPI.onBrowserPageInfoUpdated((info) => {
    console.log('页面信息:', info);
    // info包含: url, title, canGoBack, canGoForward, isLoading
});

// 监听DOM内容提取结果
window.electronAPI.onBrowserDOMContent((content) => {
    console.log('DOM内容:', content);
    // content包含: text, links, images, headings, articles
});

// 监听页面加载状态
window.electronAPI.onBrowserLoadingStarted(() => {
    console.log('开始加载');
});

window.electronAPI.onBrowserLoadingFinished(() => {
    console.log('加载完成');
});
```

### 完整的使用流程示例

#### 场景：Main进程打开小红书页面并分析内容

```typescript
// 在main进程的某个服务中
export class WebAnalysisService {
    private browserViewManager: BrowserViewManager;

    constructor(mainWindow: BrowserWindow) {
        this.browserViewManager = new BrowserViewManager(mainWindow);
        this.setupEventListeners();
    }

    // 打开页面并分析
    async analyzeWebPage(url: string): Promise<BrowserDOMContent> {
        try {
            // 1. 创建和显示BrowserView
            await this.browserViewManager.createBrowserView();
            const bounds = { x: 0, y: 120, width: 800, height: 600 };
            await this.browserViewManager.showBrowserView(bounds);

            // 2. 导航到目标页面
            await this.browserViewManager.navigateToUrl(url);

            // 3. 等待页面加载完成，然后提取DOM
            return new Promise((resolve) => {
                this.onDOMContentExtracted = (content) => {
                    resolve(content);
                };
                
                // 延迟触发DOM提取，确保页面完全加载
                setTimeout(() => {
                    this.browserViewManager.extractDOMContent();
                }, 3000);
            });
        } catch (error) {
            console.error('分析网页失败:', error);
            throw error;
        }
    }

    private setupEventListeners() {
        // 监听DOM内容提取结果
        // 这个需要在BrowserViewManager中添加事件发射器
    }
}

// 使用示例
const webAnalysis = new WebAnalysisService(mainWindow);
const content = await webAnalysis.analyzeWebPage('https://www.xiaohongshu.com/explore');
console.log('页面分析结果:', content);
```

## DOM内容数据结构

```typescript
interface BrowserDOMContent {
    text: string;                              // 页面主要文本内容（前5000字符）
    links: Array<{                            // 重要链接（前20个）
        text: string;                         // 链接文本
        href: string;                         // 链接地址
    }>;
    images: Array<{                           // 图片信息（前10个）
        alt: string;                          // 图片描述
        src: string;                          // 图片地址
    }>;
    headings: Array<{                         // 页面标题（前10个）
        level: number;                        // 标题级别（1-6）
        text: string;                         // 标题文本
    }>;
    articles: Array<{                         // 文章内容（前3个）
        title: string;                        // 文章标题
        content: string;                      // 文章内容
    }>;
}
```

## 配置说明

### 1. BrowserView安全配置

```typescript
// 在browser-view-manager.ts中的配置
webPreferences: {
    nodeIntegration: false,           // 禁用Node.js集成
    contextIsolation: true,           // 启用上下文隔离
    sandbox: true,                    // 启用沙箱模式
    preload: path.join(__dirname, '../../out/preload/browser-preload.js'),
    webSecurity: true,                // 启用Web安全
    allowRunningInsecureContent: false,
}
```

### 2. 边界计算

```typescript
// BrowserView会根据容器自动计算边界
const calculateBrowserViewBounds = (): BrowserViewBounds => {
    if (!containerRef.current) {
        return { x: 0, y: 0, width: 640, height: 600 };
    }

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const headerHeight = 120; // 头部高度

    return {
        x: Math.round(rect.left),
        y: Math.round(rect.top + headerHeight),
        width: Math.round(rect.width),
        height: Math.round(rect.height - headerHeight),
    };
};
```

## 故障排除

### 1. BrowserView不显示内容
- 检查preload路径是否正确：`../../out/preload/browser-preload.js`
- 确保项目已编译：`npm run build`
- 检查边界计算是否正确

### 2. DOM内容提取失败
- 确保页面完全加载后再调用提取
- 检查页面是否有复杂的JavaScript渲染
- 查看控制台是否有preload脚本错误

### 3. 事件监听不工作
- 确保在正确的生命周期阶段注册监听器
- 检查IPC通道名称是否匹配
- 验证清理函数是否正确移除监听器

## 最佳实践

1. **性能优化**
   - 只在需要时创建BrowserView
   - 及时清理不需要的监听器
   - 限制DOM提取的数据量

2. **安全考虑**
   - 始终使用sandbox模式
   - 验证所有外部URL
   - 限制preload脚本的权限

3. **用户体验**
   - 提供加载状态指示
   - 处理网络错误和超时
   - 支持用户取消操作

## 扩展功能

可以根据需要添加更多功能：
- 页面截图
- PDF生成
- 表单自动填写
- 页面性能监控
- 自定义JavaScript注入