import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NavigatorProvider } from "./components/navigator/context.tsx";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NavigatorProvider>
      <App />
    </NavigatorProvider>
  </StrictMode>
);
