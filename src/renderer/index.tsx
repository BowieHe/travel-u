import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// 渲染应用
const container = document.getElementById("root");
if (container) {
    const root = createRoot(container);
    root.render(<App />);
} else {
    console.error("Root container not found");
}
