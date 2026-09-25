import AnimatedPage from "../../components/AnimatedPage";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import ArcadePlayOverlay from "../Arcade/ArcadePlayOverlay.tsx";
import LeaderboardDialog from "../Arcade/LeaderboardDialog.tsx";
import { createArcadeGames, useIsMobileArcade, type MachineData } from "../Arcade/games.tsx";
import { useArcadeSelection } from "../Arcade/useArcadeSelection.ts";

import CrtTransition from "./CrtTransition.tsx";

const CartridgeArcade = lazy(() => import("./CartridgeArcade.tsx"));

// The cartridge arcade: one cabinet, a shelf of games. Served at /arcade; the
// old ring-of-cabinets page (pages/Arcade/page.tsx) is kept, unrouted, in
// case we swap back.
export default function ArcadeV2() {
  const isMobileArcade = useIsMobileArcade();
  const games = useMemo(createArcadeGames, []);
  const visibleGames = useMemo(
    () => (isMobileArcade ? games.filter((game) => game.availableOnMobile !== false) : games),
    [isMobileArcade, games]
  );
  const { initialMachineName, playingGame, selectGame, playGame, closeGame } =
    useArcadeSelection(visibleGames, isMobileArcade);
  const [leaderboardGame, setLeaderboardGame] = useState<MachineData | null>(null);

  // The arcade is one fixed screen: no scrolling or rubber-banding the page behind it
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const previous = targets.map((el) => [el.style.overflow, el.style.overscrollBehavior]);
    targets.forEach((el) => {
      el.style.overflow = "hidden";
      el.style.overscrollBehavior = "none";
    });
    return () => {
      targets.forEach((el, i) => {
        el.style.overflow = previous[i][0];
        el.style.overscrollBehavior = previous[i][1];
      });
    };
  }, []);
  // Full-screen TV power-on into a game, and power-off back out of it
  const [transition, setTransition] = useState<{ mode: "on" | "off"; game: MachineData | null } | null>(null);
  const startGame = (game: MachineData) => setTransition({ mode: "on", game });
  const leaveGame = () => setTransition({ mode: "off", game: null });

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <Suspense fallback={<LoadingSpinner />}>
        <CartridgeArcade
          games={visibleGames}
          initialGameName={initialMachineName}
          paused={Boolean(playingGame?.game)}
          onInsert={(game) => selectGame(game, { replace: true })}
          onPlay={startGame}
          onLeaderboard={setLeaderboardGame}
        />
      </Suspense>
      {leaderboardGame && (
        <LeaderboardDialog
          game={leaderboardGame.name}
          accent={leaderboardGame.cartridge.color}
          onClose={() => setLeaderboardGame(null)}
        />
      )}
      <ArcadePlayOverlay machine={playingGame} onClose={leaveGame} returnPath="/arcade" />
      {transition && (
        <CrtTransition
          mode={transition.mode}
          onMidpoint={() => {
            if (transition.mode === "on" && transition.game) playGame(transition.game);
            else closeGame();
          }}
          onDone={() => setTransition(null)}
        />
      )}
    </AnimatedPage>
  );
}
