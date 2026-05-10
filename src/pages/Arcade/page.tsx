import AnimatedPage from "../../components/AnimatedPage";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  Suspense,
  lazy,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import GameRenderer from "./GameRenderer.tsx";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import Toolbar from "./Toolbar.tsx";
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";

const ArcadeGallery = lazy(() => import("./ArcadeGallery.tsx"));
const EightBitEvil = lazy(() => import("./8BitEvil/GameRenderer.jsx"));

interface CustomWindow extends Window {
  customFunctions?: {
    onDeath?: (score: number) => void;
  };
}

type GameInstance = {
  destroy?: (removeCanvas?: boolean) => void;
};

type MachineData = {
  name: string;
  videoUrl?: string;
  availableOnMobile?: boolean;
  game: ReactNode;
};

const ORIGINAL_EIGHT_BIT_EVIL = "8 Bit Evil";
const mobileArcadeQuery = "(max-width: 768px), (pointer: coarse)";
const GAME_TOOLBAR_HEIGHT = 56;

function normalizeMachineName(name: string) {
  return name
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function useIsMobileArcade() {
  const getMatches = () =>
    typeof window !== "undefined" &&
    window.matchMedia(mobileArcadeQuery).matches;

  const [isMobile, setIsMobile] = useState(getMatches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(mobileArcadeQuery);
    const handleChange = () => setIsMobile(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return isMobile;
}

export default function Arcade() {
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null);
  const isMobileArcade = useIsMobileArcade();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGameName = searchParams.get("game") || "";

  const machinesData = useMemo<MachineData[]>(() => [
    {
      name: "8 Bit Evil Returns",
      videoUrl: "/game-recordings/8BitEvilReturnsMenu.mp4",
      game: (
        <GameRenderer
          title="8 Bit Evil Returns"
          url="https://scarbone98.github.io/8BitEvilReturnsBuild/"
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={() => {
            const handleMessage = async (e: MessageEvent) => {
              if (e.data.type === "unityReady") {
                const {
                  data: { user },
                } = await supabase.auth.getUser();

                if (user?.id) {
                  (e.source as WindowProxy | null)?.postMessage(
                    {
                      type: "SCARATHON_USER",
                      userId: user.id,
                      apiBaseUrl: import.meta.env.VITE_BASE_URL || "",
                    },
                    e.origin || "*"
                  );
                }
              }

              if (e.data.type === "PLAYER_DIED") {
                await fetchWithAuth("/games/submitScore", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    game: "8 Bit Evil Returns",
                    metricName: "score",
                    metricValue: e.data.score,
                  }),
                }).then((res) => res.json());
              }
            };
            window.addEventListener("message", handleMessage);

            return () => {
              window.removeEventListener("message", handleMessage);
            };
          }}
        />
      ),
    },
    {
      name: "Hemlock's Tower",
      videoUrl: "/game-recordings/Ascension.mp4",
      game: (
        <GameRenderer
          title="Hemlock's Tower"
          url="https://sclondon.github.io/Ascension/build/AscensionOutFromTheDeep.html"
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={() => {
            window.onmessage = async (e) => {
              if (e.data.type === "PLAYER_DIED") {
                await fetchWithAuth("/games/submitScore", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    game: "Hemlock's Tower",
                    metricName: "score",
                    metricValue: e.data.score,
                  }),
                }).then((res) => res.json());
              }
            };

            return () => {
              window.onmessage = null;
            };
          }}
        />
      ),
    },
    {
      name: "Tlaloc’s Curse",
      videoUrl: "",
      game: (
        <GameRenderer
          title="Tlaloc’s Curse"
          url="https://scarbone98.github.io/tlalocs-curse-pinball/"
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={() => {
            window.onmessage = async (e) => {
              if (e.data.type === "PLAYER_DIED") {
                await fetchWithAuth("/games/submitScore", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    game: "Tlaloc’s Curse",
                    metricName: "score",
                    metricValue: e.data.score,
                  }),
                }).then((res) => res.json());
              }
            };

            return () => {
              window.onmessage = null;
            };
          }}
        />
      ),
    },
    {
      name: "Ooidash",
      videoUrl: "/game-recordings/Ascension.mp4",
      game: (
        <GameRenderer
          title="Ooidash"
          url="https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html?v=ceda3b5"
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={() => {
            window.onmessage = async (e) => {
              if (e.data.type === "PLAYER_DIED") {
                await fetchWithAuth("/games/submitScore", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    game: "Ooidash",
                    metricName: "score",
                    metricValue: e.data.score,
                  }),
                }).then((res) => res.json());
              }
            };

            return () => {
              window.onmessage = null;
            };
          }}
        />
      ),
    },
    {
      name: ORIGINAL_EIGHT_BIT_EVIL,
      videoUrl: "/game-recordings/8BitEvil.mp4",
      availableOnMobile: false,
      game: (
        <Suspense fallback={<LoadingSpinner />}>
          <EightBitEvil
            onLoad={(gameInstance: GameInstance) => {
              if (!(window as CustomWindow).customFunctions) {
                (window as CustomWindow).customFunctions = {};
              }

              if ((window as CustomWindow).customFunctions) {
                ((window as CustomWindow).customFunctions ??= {}).onDeath =
                  async (score: number) => {
                    await fetchWithAuth("/games/submitScore", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        game: "8 Bit Evil",
                        metricName: "score",
                        metricValue: score,
                      }),
                    }).then((res) => res.json());
                  };
              }

              return () => {
                gameInstance?.destroy?.(true);
                (window as CustomWindow).customFunctions = {};
              };
            }}
          />
        </Suspense>
      ),
    },
  ], []);

  const visibleMachinesData = useMemo(
    () =>
      isMobileArcade
        ? machinesData.filter((machine) => machine.availableOnMobile !== false)
        : machinesData,
    [isMobileArcade, machinesData]
  );

  const initialMachineName = useMemo(() => {
    const normalizedRequestedGame = normalizeMachineName(requestedGameName);
    if (!normalizedRequestedGame) return undefined;

    return visibleMachinesData.find(
      (machine) =>
        normalizeMachineName(machine.name) === normalizedRequestedGame
    )?.name;
  }, [requestedGameName, visibleMachinesData]);

  const handleMachineSelected = (machine: MachineData) => {
    setSearchParams((currentParams) => {
      const nextParams = new URLSearchParams(currentParams);
      nextParams.set("game", machine.name);
      return nextParams;
    });
    setSelectedMachine(machine);
  };

  const handleCloseGame = useCallback(() => {
    setSelectedMachine(null);
  }, []);

  useEffect(() => {
    if (!selectedMachine) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseGame();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleCloseGame, selectedMachine]);

  useEffect(() => {
    if (isMobileArcade && selectedMachine?.availableOnMobile === false) {
      handleCloseGame();
    }
  }, [handleCloseGame, isMobileArcade, selectedMachine?.availableOnMobile]);

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <Suspense fallback={<LoadingSpinner />}>
        <ArcadeGallery
          initialMachineName={initialMachineName}
          machinesData={visibleMachinesData}
          onPlay={handleMachineSelected}
        />
      </Suspense>
      {selectedMachine?.game && (
        <div className="absolute top-0 left-0 w-full h-full bg-black bg-opacity-50 flex items-center justify-center">
          <div className="h-fit w-fit flex flex-col items-center justify-center">
            <Toolbar
              currentGame={selectedMachine.name}
              onClose={handleCloseGame}
            />
            {selectedMachine.game}
          </div>
        </div>
      )}
    </AnimatedPage>
  );
}
