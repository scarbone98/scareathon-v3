// src/components/AnimatedRoutes.tsx
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import LoadingSpinner from "./LoadingSpinner";
import { stationUrlFor } from "../station/places";

// The site is Wayside Station. Besides the station itself, only the pages it loads are
// left: the in-site games (played inside the arcade's cabinet) and the password reset
// that sign-in emails link to. Any other address is an old classic-site link and goes to
// the matching place in the station (the same map as the redirects in vercel.json).
// (the station's 3D scene is lazy in the page too, but its download, three.js and all,
// starts alongside the page's rather than waiting for it)
const Station = lazy(() => {
  void import("../station/StationScene.tsx").catch(() => undefined);
  return import("../station/page");
});
const ResetPassword = lazy(() => import("../pages/Authentication/ResetPassword/page"));
const Casino = lazy(() => import("../pages/Casino/page"));
const CryptClash = lazy(() => import("../pages/Royale/page"));
const HordeRush = lazy(() => import("../pages/HordeRush/page"));
const WaysideFury = lazy(() => import("../pages/WaysideFury/page"));
const MysteryCrypt = lazy(() => import("../pages/MysteryCrypt/page"));
const FrogBall = lazy(() => import("../pages/FrogBall/page"));
const GhostRidge = lazy(() => import("../pages/GhostRidge/page"));
const Muertos = lazy(() => import("../pages/Muertos/page"));
const EightBitEvilV2 = lazy(() => import("../pages/EightBitEvilV2/page"));
const PictoBox = lazy(() => import("../pages/PictoBox/page"));
const WaysideOnline = lazy(() => import("../pages/WaysideOnline/page"));
const ScareCapitalist = lazy(() => import("../pages/ScareCapitalist/page"));
const Scaredle = lazy(() => import("../pages/DailyPuzzles/Scaredle/page"));
const CrossBones = lazy(() => import("../pages/DailyPuzzles/CrossBones/page"));

const PAGES: [string, React.ComponentType][] = [
  ["/station", Station],
  ["/reset-password", ResetPassword],
  ["/casino", Casino],
  ["/crypt-clash", CryptClash],
  ["/horde-rush", HordeRush],
  ["/wayside-fury", WaysideFury],
  ["/mystery-crypt", MysteryCrypt],
  ["/frog-ball", FrogBall],
  ["/ghost-ridge", GhostRidge],
  ["/muertos", Muertos],
  ["/8ber", EightBitEvilV2],
  ["/picto-box", PictoBox],
  ["/wayside-online", WaysideOnline],
  ["/scary-capitalist", ScareCapitalist],
  ["/scaredle", Scaredle],
  ["/cross-bones", CrossBones],
  // Its first address, from the day it was called Scare Capitalist
  ["/scare-capitalist", ScareCapitalist],
];

function ToStation() {
  const location = useLocation();
  // (the front door keeps what was asked of it: ?hour=, say)
  const to = location.pathname === "/" ? `/station${location.search}` : stationUrlFor(location.pathname, location.search);
  return <Navigate to={to} replace />;
}

export const AnimatedRoutes = () => {
  const location = useLocation();

  return (
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
      {/* Monster Bash is a room of the casino now; its old address still works */}
      <Route path="/monster-bash" element={<Navigate to="/casino?room=monster-bash" replace />} />
      <Route path="*" element={<ToStation />} />
    </Routes>
  );
};
