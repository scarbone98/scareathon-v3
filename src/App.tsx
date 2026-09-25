// src/App.tsx
import "./index.css";
import { LazyMotion, domAnimation } from "framer-motion";
import { BrowserRouter as Router } from "react-router-dom";
import { Navigator } from "./components/navigator/Navigator";
import { PageContainer } from "./components/PageContainer";
import { AnimatedRoutes } from "./components/AnimatedRoutes";
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { AvatarCompositeEnsurer } from "./components/avatar/AvatarCompositeEnsurer";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

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
      <AvatarCompositeEnsurer />
      {!isResetPasswordPage && <Navigator />}
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
    <LazyMotion features={domAnimation}>
      <Router>
        <AppContent />
      </Router>
    </LazyMotion>
  );
}

export default App;
