import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { normalizeMachineName, type MachineData } from "./games.tsx";

// Which game the URL asks for (?game=), and which game is open and playing.
// Shared by /arcade and /arcade-v2.
export function useArcadeSelection(games: MachineData[], isMobileArcade: boolean) {
  const [playingGame, setPlayingGame] = useState<MachineData | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGameName = searchParams.get("game") || "";

  const initialMachineName = useMemo(() => {
    const normalizedRequestedGame = normalizeMachineName(requestedGameName);
    if (!normalizedRequestedGame) return undefined;

    return games.find(
      (machine) =>
        normalizeMachineName(machine.name) === normalizedRequestedGame
    )?.name;
  }, [requestedGameName, games]);

  // Remember the game in the URL so the page can be shared or reloaded onto it.
  // replace: swap the URL in place instead of adding a history entry.
  const selectGame = useCallback((machine: MachineData, options?: { replace?: boolean }) => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("game", machine.name);
      return nextParams;
    }, { replace: options?.replace });
  }, [setSearchParams]);

  const playGame = useCallback((machine: MachineData) => {
    setPlayingGame(machine);
  }, []);

  const closeGame = useCallback(() => {
    setPlayingGame(null);
  }, []);

  useEffect(() => {
    if (!playingGame) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeGame();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeGame, playingGame]);

  useEffect(() => {
    if (isMobileArcade && playingGame?.availableOnMobile === false) {
      closeGame();
    }
  }, [closeGame, isMobileArcade, playingGame?.availableOnMobile]);

  return { initialMachineName, playingGame, selectGame, playGame, closeGame };
}
