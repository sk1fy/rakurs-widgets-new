import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { consumeBrowserSession } from "./settings/browserSession";
import "./styles/design.css";
import "./styles/app.css";

// Remove the short-lived fragment credential before any route is rendered.
consumeBrowserSession();
createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
