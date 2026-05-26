import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installConsoleRing } from "./lib/console-ring";

// Patch console.* before anything else loads so every log surfaces in the
// Debug panel's ring buffer — including early initialization noise from
// stores, listeners, and effects.
installConsoleRing();

const rootElement: HTMLElement | null = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
