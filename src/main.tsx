import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NavigatorProvider } from "./components/navigator/context.tsx";
import App from "./App.tsx";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

// After a deploy, a tab opened earlier asks for page files that no longer
// exist, and Vite fires this. Reload once to pick up the new version; if that
// just happened, let the error boundary explain instead of reloading forever.
window.addEventListener("vite:preloadError", (event) => {
  const key = "reloadedForNewVersionAt";
  const last = Number(sessionStorage.getItem(key) || 0);
  if (Date.now() - last < 10_000) return;
  sessionStorage.setItem(key, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NavigatorProvider>
        <App />
      </NavigatorProvider>
    </QueryClientProvider>
  </StrictMode>
);
