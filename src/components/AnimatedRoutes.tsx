// src/components/AnimatedRoutes.tsx
import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Home from "../pages/Home/page";
import Arcade from "../pages/Arcade/page";
import Authentication from "../pages/Authentication/page";
import Scareboard from "../pages/Scareboard/page";
import Calendar from "../pages/Calendar/page";

export const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/arcade" element={<Arcade />} />
        <Route path="/authentication" element={<Authentication />} />
        <Route path="/scareboard" element={<Scareboard />} />
        <Route path="/calendar" element={<Calendar />} />
      </Routes>
    </AnimatePresence>
  );
};
