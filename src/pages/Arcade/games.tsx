// The arcade's game list and the plumbing shared by every arcade page:
// score submission, guest-score events, and the mobile check. Add a game here
// once and it shows up in both /arcade and /arcade-v2.
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import GameRenderer from "./GameRenderer.tsx";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";

const EightBitEvil = lazy(() => import("./8BitEvil/GameRenderer.jsx"));

interface CustomWindow extends Window {
  customFunctions?: {
    onDeath?: (score: number) => void;
  };
}

type GameInstance = {
  destroy?: (removeCanvas?: boolean) => void;
};

export type MachineData = {
  name: string;
  videoUrl?: string;
  availableOnMobile?: boolean;
  // Games that don't submit scores hide the Leaderboard button.
  hasLeaderboard?: boolean;
  // Label colour and one-line pitch for the /arcade-v2 cartridge shelf.
  cartridge: { color: string; tagline: string };
  game: ReactNode;
};

const ORIGINAL_EIGHT_BIT_EVIL = "8 Bit Evil";
export const mobileArcadeQuery = "(max-width: 768px), (pointer: coarse)";
export const GAME_TOOLBAR_HEIGHT = 56;
const EIGHT_BIT_EVIL_RETURNS_URL =
  "https://scarbone98.github.io/8BitEvilReturnsBuild/";
const HEMLOCKS_TOWER_URL =
  "https://sclondon.github.io/Ascension/build/AscensionOutFromTheDeep.html?v=6465b08";
const TLALOCS_CURSE_URL = "https://scarbone98.github.io/tlalocs-curse-pinball/";
const OOIDASH_URL =
  "https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html?v=d653abc";
const SALMON_RUN_2_URL = "https://sclondon.github.io/SalmonRun2/build/index.html?v=44f83ee";
const WIRTWARE_URL = "https://sclondon.github.io/WirtWare/build/index.html?v=b4274c9";
const HORDE_RUSH_URL = "/horde-rush";
const FROG_BALL_URL = "/frog-ball";
const BOB_URL = "https://sclondon.github.io/BOB/build/index.html?v=4147811";

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
export const GUEST_SCORE_EVENT = "arcade:guest-score";
export type GuestScore = { game: string; score: number };

export async function submitArcadeScore(game: string, score: unknown) {
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

export function normalizeMachineName(name: string) {
  return name
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

export function useIsMobileArcade() {
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

// Builds the list fresh; call it once per page (e.g. in useMemo).
export function createArcadeGames(): MachineData[] {
  return [
    {
      name: "8 Bit Evil Returns",
      cartridge: { color: "#e0433b", tagline: "The pixel nightmare is back." },
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
      cartridge: { color: "#3fb68b", tagline: "Climb out from the deep." },
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
      cartridge: { color: "#2f86d6", tagline: "Pinball under a storm god’s curse." },
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
      cartridge: { color: "#f2a93b", tagline: "Dash for the high score." },
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
      cartridge: { color: "#f07a5a", tagline: "Race a salmon down a jungle river." },
      videoUrl: "/game-recordings/SalmonRun2.mp4",
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
      name: "WirtWare",
      cartridge: { color: "#a86ee0", tagline: "Tiny games, faster and faster." },
      videoUrl: "/game-recordings/WirtWare.mp4",
      game: (
        <GameRenderer
          title="WirtWare"
          url={WIRTWARE_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "WirtWare", WIRTWARE_URL)
          }
        />
      ),
    },
    {
      name: "Crypt Clash",
      cartridge: { color: "#7d8a99", tagline: "Last one standing wins." },
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
      cartridge: { color: "#c23b5a", tagline: "Grow your squad, blast the horde." },
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
      name: "Frog Ball",
      cartridge: { color: "#6cc04a", tagline: "Roll a frog through dream worlds." },
      videoUrl: "/game-recordings/FrogBall.mp4",
      game: (
        <GameRenderer
          title="Frog Ball"
          url={FROG_BALL_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Frog Ball", FROG_BALL_URL)
          }
        />
      ),
    },
    {
      name: "BOB",
      cartridge: { color: "#f4f1e8", tagline: "Look after a stick figure." },
      videoUrl: "/game-recordings/BOB.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="BOB"
          url={BOB_URL}
          allow="accelerometer; gyroscope"
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: ORIGINAL_EIGHT_BIT_EVIL,
      cartridge: { color: "#9e2f2a", tagline: "Where it all began." },
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
  ];
}
