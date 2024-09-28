// src/components/AnimatedRoutes.tsx
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState, Suspense } from "react";
import { supabase } from "../supabaseClient"; // Ensure this import path is correct
import { lazy } from "react";
import LoadingSpinner from "./LoadingSpinner";

const Home = lazy(() => import("../pages/Home/page"));
const Arcade = lazy(() => import("../pages/Arcade/page"));
const Authentication = lazy(() => import("../pages/Authentication/page"));
const Scareboard = lazy(() => import("../pages/Scareboard/page"));
const Calendar = lazy(() => import("../pages/Calendar/page"));
const Rules = lazy(() => import("../pages/Rules/page"));
const Announcements = lazy(() => import("../pages/Announcements/page"));
const AnnouncementDetails = lazy(() => import("../pages/AnnouncementDetails/page"));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

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
    return <LoadingSpinner />;
  }

  if (!session) {
    return (
      <Navigate to="/authentication" state={{ from: location.pathname }} replace />
    );
  }

  return <>{children}</>;
};

export const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <Home />
            </Suspense>
          }
        />
        <Route
          path="/authentication"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <Authentication />
            </Suspense>
          }
        />
        <Route
          path="/rules"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <Rules />
            </Suspense>
          }
        />
        <Route
          path="/announcements"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <Announcements />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/arcade"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <Arcade />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/scareboard"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <Scareboard />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <Calendar />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/announcements/:id"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <AnnouncementDetails />
              </Suspense>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AnimatePresence>
  );
};
