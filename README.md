# Travel-U Electron App

## Development

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

Build the app:

```bash
npm run build
```

## Testing

Run the test:

```bash
npx vitest run tests/index.test.ts
```

## Project Structure

-   `src/main.ts` - Main Electron process
-   `src/preload.ts` - Preload script for secure renderer communication
-   `src/renderer/` - Renderer process files (HTML, CSS, JS)
-   `tests/` - Test files

我现在的这个代码，有一个文件夹，
@src/main/services/workflows/user-interaction/
这里面是用户交互的一个子图
在 @src/main/services/workflows/main-graph.ts 中我调转到 ask_user
node 的时候会进入到这个子图
但是我在 @src/main/services/workflows/user-interaction/graph.ts
中运行到 waitForUserNode 的时候，会 interrupt，然后等待用户的输入。
现在在 @src/main/services/langgraph.ts @src/main/ipc/chat-api.ts 和
@src/renderer/components/ChatDrawer.tsx 中的实现不是我想要的
在用户输入 interrupt 之后的消息后，整个图从日志看会从 main-graph 的
router 重新进入， 而不是从 user-interaction 的 graph 中的断点 resume。
参考这个网址里面的信息， https://langchain-ai.github.io/langgraph/how-tos
/human_in_the_loop/add-human-in-the-loop/#approve-or-reject
帮我实现 resume 的这个功能。
