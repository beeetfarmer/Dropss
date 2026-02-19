import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyAccent } from "./lib/accent";

applyAccent();

createRoot(document.getElementById("root")!).render(<App />);
