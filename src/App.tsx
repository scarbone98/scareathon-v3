// src/App.tsx
import "./index.css";
import { BrowserRouter as Router } from "react-router-dom";
import { PageContainer } from "./components/PageContainer";
import { AnimatedRoutes } from "./components/AnimatedRoutes";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AvatarCompositeEnsurer } from "./components/avatar/AvatarCompositeEnsurer";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

const AppContent = () => {
  const location = useLocation();
  useEffect(() => {
    const setVh = () => {
      document.documentElement.style.setProperty(
        "--vh",
        `${window.innerHeight}px`
      );
    };
    setVh();
    window.addEventListener("resize", setVh);
    return () => window.removeEventListener("resize", setVh);
  }, []);

  return (
    <>
      <AvatarCompositeEnsurer />
      <PageContainer>
        <AppErrorBoundary resetKey={location.pathname}>
          <AnimatedRoutes />
        </AppErrorBoundary>
      </PageContainer>
    </>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
