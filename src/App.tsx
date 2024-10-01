// src/App.tsx
import "./index.css";
import { BrowserRouter as Router } from "react-router-dom";
import { Navigator } from "./components/navigator/Navigator";
import { PageContainer } from "./components/PageContainer";
import { AnimatedRoutes } from "./components/AnimatedRoutes";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import GhostCursor from "./components/GhostCursor";

const AppContent = () => {
  const location = useLocation();
  const isResetPasswordPage = location.pathname === "/reset-password";

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
      <GhostCursor />
      {!isResetPasswordPage && <Navigator />}
      <PageContainer>
        <AnimatedRoutes />
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
