// src/components/AnimatedRoutes.tsx
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Suspense, lazy } from "react";
import LoadingSpinner from "./LoadingSpinner";
import { stationUrlFor } from "../station/places";

// The site is Wayside Station. Besides the station itself, only the pages it loads are
// left: the in-site games (played inside the arcade's cabinet) and the password reset
// that sign-in emails link to. Any other address is an old classic-site link and goes to
// the matching place in the station (the same map as the redirects in vercel.json).
const Station = lazy(() => import("../station/page"));
const ResetPassword = lazy(() => import("../pages/Authentication/ResetPassword/page"));
const MonsterBash = lazy(() => import("../pages/MonsterBash/page"));
const CryptClash = lazy(() => import("../pages/Royale/page"));
const HordeRush = lazy(() => import("../pages/HordeRush/page"));
const MysteryCrypt = lazy(() => import("../pages/MysteryCrypt/page"));
const FrogBall = lazy(() => import("../pages/FrogBall/page"));
const GhostRidge = lazy(() => import("../pages/GhostRidge/page"));
const Muertos = lazy(() => import("../pages/Muertos/page"));
const PictoBox = lazy(() => import("../pages/PictoBox/page"));
const WaysideOnline = lazy(() => import("../pages/WaysideOnline/page"));

const PAGES: [string, React.ComponentType][] = [
  ["/station", Station],
  ["/reset-password", ResetPassword],
  ["/monster-bash", MonsterBash],
  ["/crypt-clash", CryptClash],
  ["/horde-rush", HordeRush],
  ["/mystery-crypt", MysteryCrypt],
  ["/frog-ball", FrogBall],
  ["/ghost-ridge", GhostRidge],
  ["/muertos", Muertos],
  ["/picto-box", PictoBox],
  ["/wayside-online", WaysideOnline],
];

function ToStation() {
  const location = useLocation();
  const to = location.pathname === "/" ? "/station" : stationUrlFor(location.pathname, location.search);
  return <Navigate to={to} replace />;
}

export const AnimatedRoutes = () => {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {PAGES.map(([path, Page]) => (
          <Route
            key={path}
            path={path}
            element={
              <Suspense fallback={<LoadingSpinner />}>
                <Page />
              </Suspense>
            }
          />
        ))}
        <Route path="*" element={<ToStation />} />
      </Routes>
    </AnimatePresence>
  );
};
