// src/App.tsx
import "./index.css";
import { BrowserRouter as Router } from "react-router-dom";
import { Navigator } from "./components/navigator/Navigator";
import { PageContainer } from "./components/PageContainer";
import { AnimatedRoutes } from "./components/AnimatedRoutes";
import GhostCursor from './components/GhostCursor';

function App() {
  return (
    <Router>
      <GhostCursor />
      <Navigator />
      <PageContainer>
        <AnimatedRoutes />
      </PageContainer>
    </Router>
  );
}

export default App;
