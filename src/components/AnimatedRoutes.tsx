// src/components/AnimatedRoutes.tsx
import {
  Routes,
  Route,
  useLocation,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useEffect, useState, Suspense } from "react";
import { lazy } from "react";
import type { Session } from "@supabase/supabase-js";
import { shouldClearAuthSession } from "../authErrors";
import LoadingSpinner from "./LoadingSpinner";

const Home = lazy(() => import("../pages/Home/page"));
const Arcade = lazy(() => import("../pages/Arcade/page"));
const Authentication = lazy(() => import("../pages/Authentication/page"));
const Scareboard = lazy(() => import("../pages/Scareboard/page"));
const Calendar = lazy(() => import("../pages/Calendar/page"));
const Rules = lazy(() => import("../pages/Rules/page"));
const Announcements = lazy(() => import("../pages/Announcements/page"));
const AnnouncementDetails = lazy(
  () => import("../pages/AnnouncementDetails/page")
);
const ResetPassword = lazy(
  () => import("../pages/Authentication/ResetPassword/page")
);
const Profile = lazy(() => import("../pages/Profile/page"));
const Post = lazy(() => import("../pages/Post/page"));

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    let unsubscribe: (() => void) | undefined;

    import("../supabaseClient")
      .then(({ supabase }) => {
        if (!isMounted) return;

        supabase.auth.getSession().then(async ({ data: { session } }) => {
          if (!isMounted) return;

          if (session) {
            const {
              data: { user },
              error,
            } = await supabase.auth.getUser();

            if (!isMounted) return;

            if (error || !user) {
              if (shouldClearAuthSession(error)) {
                await supabase.auth.signOut();
                setSession(null);
              } else {
                setSession(session);
              }
              setLoading(false);
              return;
            }
          }

          setSession(session);
          setLoading(false);
        });

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
          if (isMounted) {
            setSession(session);
          }
        });

        unsubscribe = () => subscription.unsubscribe();
      })
      .catch((error) => {
        console.error("Error loading auth client", error);
        if (isMounted) {
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    if (loading || session || location.pathname === "/authentication") {
      return;
    }

    navigate("/authentication", {
      replace: true,
      state: { from: location.pathname },
    });
  }, [loading, session, location.pathname, navigate]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!session) return null;

  return <>{children}</>;
};

export const AnimatedRoutes = () => {
  const location = useLocation();
  const routeAnimationKey = location.pathname.startsWith("/profile")
    ? "/profile"
    : location.pathname;

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={routeAnimationKey}>
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
          path="/reset-password"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <ResetPassword />
            </Suspense>
          }
        />
        <Route
          path="/post/:documentId"
          element={
            <Suspense fallback={<LoadingSpinner />}>
              <Post />
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
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <Profile />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/inbox"
          element={
            <ProtectedRoute>
              <Suspense fallback={<LoadingSpinner />}>
                <Profile />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/inbox"
          element={
            <ProtectedRoute>
              <Navigate to="/profile/inbox" replace />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AnimatePresence>
  );
};
