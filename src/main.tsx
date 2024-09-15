import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NavigatorProvider } from "./components/navigator/context.tsx";
import App from "./App.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NavigatorProvider>
        <App />
      </NavigatorProvider>
    </QueryClientProvider>
  </StrictMode>
);
