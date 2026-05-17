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
import { useNavigatorContext } from "../../components/navigator/context.tsx";

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
const EIGHT_BIT_EVIL_RETURNS_URL =
  "https://scarbone98.github.io/8BitEvilReturnsBuild/";
const HEMLOCKS_TOWER_URL =
  "https://sclondon.github.io/Ascension/build/AscensionOutFromTheDeep.html";
const TLALOCS_CURSE_URL = "https://scarbone98.github.io/tlalocs-curse-pinball/";
const OOIDASH_URL =
  "https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html?v=bf98d08";

type ArcadeMessage = {
  type?: unknown;
  score?: unknown;
};

function getUrlOrigin(url: string) {
  return new URL(url).origin;
}

function isArcadeMessage(value: unknown): value is ArcadeMessage {
  return typeof value === "object" && value !== null;
}

async function submitArcadeScore(game: string, score: unknown) {
  const metricValue = Number(score);
  if (!Number.isFinite(metricValue) || metricValue < 0) return;

  const response = await fetchWithAuth("/games/submitScore", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      game,
      metricName: "score",
      metricValue,
    }),
  });

  if (!response.ok) {
    console.error(`Score submission failed for ${game}`, await response.text());
  }
}

function isTrustedGameMessage(
  iframe: HTMLIFrameElement,
  event: MessageEvent,
  expectedOrigin: string
) {
  return event.source === iframe.contentWindow && event.origin === expectedOrigin;
}

function listenForPlayerDiedScores(
  iframe: HTMLIFrameElement,
  game: string,
  gameUrl: string
) {
  const expectedOrigin = getUrlOrigin(gameUrl);

  const handleMessage = async (event: MessageEvent) => {
    if (!isTrustedGameMessage(iframe, event, expectedOrigin)) return;
    if (!isArcadeMessage(event.data) || event.data.type !== "PLAYER_DIED") return;

    await submitArcadeScore(game, event.data.score);
  };

  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}

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
  const { height: headerHeight } = useNavigatorContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedGameName = searchParams.get("game") || "";

  const machinesData = useMemo<MachineData[]>(() => [
    {
      name: "8 Bit Evil Returns",
      videoUrl: "/game-recordings/8BitEvilReturnsMenu.mp4",
      game: (
        <GameRenderer
          title="8 Bit Evil Returns"
          url={EIGHT_BIT_EVIL_RETURNS_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => {
            const expectedOrigin = getUrlOrigin(EIGHT_BIT_EVIL_RETURNS_URL);

            const handleMessage = async (e: MessageEvent) => {
              if (!isTrustedGameMessage(iframe, e, expectedOrigin)) return;
              if (!isArcadeMessage(e.data)) return;

              if (e.data.type === "unityReady") {
                const {
                  data: { session },
                } = await supabase.auth.getSession();

                if (session?.user?.id) {
                  (e.source as WindowProxy | null)?.postMessage(
                    {
                      type: "SCARATHON_USER",
                      userId: session.user.id,
                      accessToken: session.access_token,
                      apiBaseUrl: import.meta.env.VITE_BASE_URL || "",
                    },
                    e.origin
                  );
                }
              }

              if (e.data.type === "PLAYER_DIED") {
                await submitArcadeScore("8 Bit Evil Returns", e.data.score);
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
          url={HEMLOCKS_TOWER_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Hemlock's Tower", HEMLOCKS_TOWER_URL)
          }
        />
      ),
    },
    {
      name: "Tlaloc’s Curse",
      videoUrl: "",
      game: (
        <GameRenderer
          title="Tlaloc’s Curse"
          url={TLALOCS_CURSE_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Tlaloc’s Curse", TLALOCS_CURSE_URL)
          }
        />
      ),
    },
    {
      name: "Ooidash",
      videoUrl: "/game-recordings/Ascension.mp4",
      game: (
        <GameRenderer
          title="Ooidash"
          url={OOIDASH_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Ooidash", OOIDASH_URL)
          }
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
                    await submitArcadeScore("8 Bit Evil", score);
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
        <div
          className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center bg-black bg-opacity-50"
          style={{ top: headerHeight }}
        >
          <div className="flex h-full w-fit flex-col items-center justify-start">
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
