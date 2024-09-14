import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { NavigatorProvider } from "./components/navigator/context.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NavigatorProvider>
      <App />
    </NavigatorProvider>
  </StrictMode>
);
