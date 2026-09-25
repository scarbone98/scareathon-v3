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
import { Link, useSearchParams } from "react-router-dom";
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
  // Games that don't submit scores hide the Leaderboard button.
  hasLeaderboard?: boolean;
  game: ReactNode;
};

const ORIGINAL_EIGHT_BIT_EVIL = "8 Bit Evil";
const mobileArcadeQuery = "(max-width: 768px), (pointer: coarse)";
const GAME_TOOLBAR_HEIGHT = 56;
const EIGHT_BIT_EVIL_RETURNS_URL =
  "https://scarbone98.github.io/8BitEvilReturnsBuild/";
const HEMLOCKS_TOWER_URL =
  "https://sclondon.github.io/Ascension/build/AscensionOutFromTheDeep.html?v=23a2167";
const TLALOCS_CURSE_URL = "https://scarbone98.github.io/tlalocs-curse-pinball/";
const OOIDASH_URL =
  "https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html?v=d653abc";
const SALMON_RUN_2_URL = "https://sclondon.github.io/SalmonRun2/build/index.html?v=92e62b6";
const HORDE_RUSH_URL = "/horde-rush";

type ArcadeMessage = {
  type?: unknown;
  score?: unknown;
};

// Relative URLs are games served by this site, like /horde-rush
function getUrlOrigin(url: string) {
  return new URL(url, window.location.href).origin;
}

function isArcadeMessage(value: unknown): value is ArcadeMessage {
  return typeof value === "object" && value !== null;
}

// Guests can play but not save; the page listens for this to offer a sign-in
const GUEST_SCORE_EVENT = "arcade:guest-score";
type GuestScore = { game: string; score: number };

async function submitArcadeScore(game: string, score: unknown) {
  const metricValue = Number(score);
  if (!Number.isFinite(metricValue) || metricValue < 0) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    window.dispatchEvent(
      new CustomEvent<GuestScore>(GUEST_SCORE_EVENT, { detail: { game, score: metricValue } })
    );
    return;
  }

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
      videoUrl: "/game-recordings/TlalocsCurse.mp4",
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
      videoUrl: "/game-recordings/Ooidash.mp4",
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
      name: "Salmon Run 2",
      videoUrl: "/game-recordings/SalmonRun2.mp4",
      // Landscape 3D game played with keyboard or gamepad; no touch controls yet
      availableOnMobile: false,
      game: (
        <GameRenderer
          title="Salmon Run 2"
          url={SALMON_RUN_2_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Salmon Run 2", SALMON_RUN_2_URL)
          }
        />
      ),
    },
    {
      name: "Crypt Clash",
      videoUrl: "/game-recordings/CryptClash.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Crypt Clash"
          url="/crypt-clash"
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: "Horde Rush",
      videoUrl: "/game-recordings/HordeRush.mp4",
      game: (
        <GameRenderer
          title="Horde Rush"
          url={HORDE_RUSH_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Horde Rush", HORDE_RUSH_URL)
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

  const [guestScore, setGuestScore] = useState<GuestScore | null>(null);
  useEffect(() => {
    const handleGuestScore = (event: Event) =>
      setGuestScore((event as CustomEvent<GuestScore>).detail);
    window.addEventListener(GUEST_SCORE_EVENT, handleGuestScore);
    return () => window.removeEventListener(GUEST_SCORE_EVENT, handleGuestScore);
  }, []);
  useEffect(() => {
    if (!selectedMachine) setGuestScore(null);
  }, [selectedMachine]);

  return (
    <AnimatedPage style={{ overflow: "hidden", paddingTop: 0 }}>
      <Suspense fallback={<LoadingSpinner />}>
        <ArcadeGallery
          initialMachineName={initialMachineName}
          machinesData={visibleMachinesData}
          onPlay={handleMachineSelected}
          paused={Boolean(selectedMachine?.game)}
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
              hasLeaderboard={selectedMachine.hasLeaderboard !== false}
              onClose={handleCloseGame}
            />
            {selectedMachine.game}
          </div>
          {guestScore && (
            <div
              role="status"
              className="fixed bottom-4 left-1/2 z-50 flex w-[min(92vw,30rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-amber-400/60 bg-black/90 px-4 py-3 text-sm text-amber-100 shadow-2xl"
            >
              <span className="flex-1">
                Nice run! <strong className="text-amber-300">{guestScore.score.toLocaleString()}</strong>{" "}
                points. Sign in to save your scores and earn coins.
              </span>
              <Link
                to="/authentication"
                state={{ from: `/arcade?game=${encodeURIComponent(guestScore.game)}` }}
                className="shrink-0 rounded bg-amber-500 px-3 py-2 font-bold text-black transition hover:bg-amber-400"
              >
                Sign in
              </Link>
              <button
                type="button"
                onClick={() => setGuestScore(null)}
                aria-label="Dismiss"
                className="shrink-0 px-1 text-lg leading-none text-amber-200/70 transition hover:text-amber-100"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}
    </AnimatedPage>
  );
}
