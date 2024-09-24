// src/components/AnimatedRoutes.tsx
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient"; // Ensure this import path is correct
import Home from "../pages/Home/page";
import Arcade from "../pages/Arcade/page";
import Authentication from "../pages/Authentication/page";
import Scareboard from "../pages/Scareboard/page";
import Calendar from "../pages/Calendar/page";
import Rules from "../pages/Rules/page";
import Announcements from "../pages/Announcements/page";

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return <div>Loading...</div>; // Or a loading spinner
  }

  if (!session) {
    return <Navigate to="/authentication" replace />;
  }

  return <>{children}</>;
};

export const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Home />} />
        <Route path="/authentication" element={<Authentication />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/announcements" element={<Announcements />} />
        <Route
          path="/arcade"
          element={
            <ProtectedRoute>
              <Arcade />
            </ProtectedRoute>
          }
        />
        <Route
          path="/scareboard"
          element={
            <ProtectedRoute>
              <Scareboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AnimatePresence>
  );
};
