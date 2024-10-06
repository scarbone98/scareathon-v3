// src/App.tsx
import "./index.css";
import { BrowserRouter as Router } from "react-router-dom";
import { Navigator } from "./components/navigator/Navigator";
import { PageContainer } from "./components/PageContainer";
import { AnimatedRoutes } from "./components/AnimatedRoutes";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import GhostCursor from "./components/GhostCursor";
import LoadingSpinner from "./components/LoadingSpinner";

const AppContent = () => {
  const location = useLocation();
  const isResetPasswordPage = location.pathname === "/reset-password";
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    const loadFonts = async () => {
      try {
        // make sure the fonts are loaded before continuing
        if (document.fonts) {
          await document.fonts.ready;
        }
      } catch (error) {
        console.error("Error loading fonts", error);
      } finally {
        setFontsLoaded(true);
      }
    };
    loadFonts();
  }, []);

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

  // if the fonts are not loaded, show the loading spinner
  if (!fontsLoaded) {
    return <LoadingSpinner />;
  }

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
