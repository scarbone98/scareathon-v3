// The arcade's game list and the plumbing shared by every arcade page:
// score submission, guest-score events, and the mobile check. Add a game here
// once and it shows up in both /arcade and /arcade-v2.
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import GameRenderer from "./GameRenderer.tsx";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";
import { unlockedCarts } from "./unlocks.ts";

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
  // Cartridges that aren't a game of their own: "mystery" only shows its
  // screen and can't be played; "shuffle" plays a random other game.
  // "soon": a game that isn't made yet: its cover art on the shelf, COMING SOON once plugged in.
  // "wayside": WaysideOS, a code prompt on the cabinet's screen (ArcadeV2/waysideOS.ts).
  // secret: off the shelf until its code is typed into WaysideOS (Arcade/unlocks.ts).
  secret?: boolean;
  special?: "mystery" | "shuffle" | "soon" | "wayside";
  // Label colour and one-line pitch for the /arcade-v2 cartridge shelf.
  // font: a Google Font that suits the game, for its name on the label, marquee and card.
  // about: shown by the info button on the arcade's game card; developer is a GitHub handle.
  cartridge: {
    color: string;
    tagline: string;
    font: { family: string; weight?: number };
    about: { released: string; players: string; genre: string; developer: string };
    // Written in on the back sticker, by hand: a cheat code, a hidden message
    backNote?: string;
    // No sticker on the back at all: just a strip of masking tape with this in marker
    backTape?: string;
    // A blank cassette cart: clear plastic, a plain cassette sticker on the front with this
    // written in by hand, and "Cassette Cart" on the back sticker instead of the name
    cassette?: string;
  };
  game: ReactNode;
};

const ORIGINAL_EIGHT_BIT_EVIL = "8 Bit Evil";
export const mobileArcadeQuery = "(max-width: 768px), (pointer: coarse)";
export const GAME_TOOLBAR_HEIGHT = 56;
const EIGHT_BIT_EVIL_RETURNS_URL =
  "https://scarbone98.github.io/8BitEvilReturnsBuild/";
const HEMLOCKS_TOWER_URL =
  "https://sclondon.github.io/HemlocksTower/build/HemlocksTower.html?v=10d59b2";
const TLALOCS_CURSE_URL = "https://scarbone98.github.io/tlalocs-curse-pinball/";
const OOIDASH_URL =
  "https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html?v=d653abc";
const SALMON_RUN_2_URL = "https://sclondon.github.io/SalmonRun2/build/index.html?v=44f83ee";
const WIRTWARE_URL = "https://sclondon.github.io/WirtWare/build/index.html?v=b4274c9";
const HORDE_RUSH_URL = "/horde-rush";
const MONSTER_BASH_URL = "/monster-bash";
const FROG_BALL_URL = "/frog-ball";
const MYSTERY_CRYPT_URL = "/mystery-crypt";
const GHOST_RIDGE_URL = "/ghost-ridge";
const MUERTOS_URL = "/muertos";
const DEEP_TIME_URL = "https://scarbone98.github.io/deep-time/?v=8f2bcc0";
const PICTO_BOX_URL = "/picto-box";
const BOB_URL = "https://sclondon.github.io/BOB/build/index.html?v=4147811";
const SNOW_GLOBE_URL = "https://sclondon.github.io/snowglobe-sim/?v=e6cf5b1";
const WAYSIDE_GALLERY_URL = "https://sclondon.github.io/WaysideGallery/build/index.html?v=c9eff71";
const BREEDABLE_MONSTERS_URL = "https://sclondon.github.io/BreedableMonsters/build/index.html?v=47b15c4";
const SIMULATRIX_URL = "https://sclondon.github.io/Simulatrix/build/index.html?v=ee30791";
const JACK_O_LANTERN_URL = "https://sclondon.github.io/JackOLantern/build/index.html?v=49c4f72";
// The Godot remake (github.com/scarbone98/8BitEvilReturns-godot), in testing.
const EIGHT_BIT_EVIL_RETURNS_V2_URL = "https://scarbone98.github.io/8BitEvilReturns-godot/?v=a83b763";
const LIQUID_METAL_URL = "https://sclondon.github.io/LiquidMetal/build/index.html?v=68fa5b8";

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
    return;
  }

  // What the run paid, and any challenge it just won, for the cabinet's ticket dispenser
  const { data } = (await response.json().catch(() => ({}))) as { data?: ScoreReward };
  const challenges = (data?.weeklyChallengeRewards ?? []).reduce((sum, reward) => sum + (reward.claimed ? Number(reward.rewardCoins) || 0 : 0), 0);
  const tickets = (Number(data?.coinsAwarded) || 0) + challenges;
  if (tickets > 0) {
    window.dispatchEvent(new CustomEvent<TicketsWon>(TICKETS_EVENT, { detail: { game, tickets, balance: data?.coinBalance ?? null } }));
  }
}

type ScoreReward = {
  coinsAwarded?: number;
  coinBalance?: number | null;
  weeklyChallengeRewards?: { claimed?: boolean; rewardCoins?: number }[];
};

// Tickets a signed-in run won: the arcade's dispenser feeds them out, the wallet catches up
export const TICKETS_EVENT = "arcade:tickets";
export type TicketsWon = { game: string; tickets: number; balance: number | null };

function isTrustedGameMessage(
  iframe: HTMLIFrameElement,
  event: MessageEvent,
  expectedOrigin: string
) {
  return event.source === iframe.contentWindow && event.origin === expectedOrigin;
}

// Answers a game's "unityReady" with the signed-in player's session, as the
// Unity 8 Bit Evil Returns expects. Returns the cleanup for GameRenderer.
function sendSessionWhenReady(iframe: HTMLIFrameElement, gameUrl: string) {
  const expectedOrigin = getUrlOrigin(gameUrl);
  const handleMessage = async (e: MessageEvent) => {
    if (!isTrustedGameMessage(iframe, e, expectedOrigin)) return;
    if (!isArcadeMessage(e.data) || e.data.type !== "unityReady") return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user?.id) return;
    (e.source as WindowProxy | null)?.postMessage(
      {
        type: "SCARATHON_USER",
        userId: session.user.id,
        accessToken: session.access_token,
        apiBaseUrl: import.meta.env.VITE_BASE_URL || "",
      },
      e.origin
    );
  };
  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
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
  const unlocked = unlockedCarts();
  const games: MachineData[] = [
    // Not games so much as things to do: they sit left of Shuffle (where the shelf starts)
    {
      name: "WaysideOS",
      cartridge: {
        color: "#3f6e8c",
        tagline: "Boots to a prompt. Know any codes?",
        font: { family: "VT323" },
        about: { released: "2026", players: "Single player", genre: "Operating system", developer: "sclondon" },
        backNote: "try HELP",
        cassette: "Admin Terminal",
      },
      // No video: the cabinet draws its screen live. The URL finds its label, stills/WaysideOS.jpg
      videoUrl: "/game-recordings/WaysideOS.mp4",
      hasLeaderboard: false,
      special: "wayside",
      game: null,
    },
    {
      // The arcade's message board: a General board and the Scareathon's, posts, replies, reactions
      name: "Wayside Online",
      cartridge: {
        color: "#1a2a6c",
        tagline: "Dial in. Post, reply, react.",
        font: { family: "Press Start 2P" },
        about: { released: "2026", players: "Everyone", genre: "Message board", developer: "scarbone98" },
        backNote: "Be kind on the line.",
        cassette: "Wayside Online",
      },
      // No video: the URL finds its label still, stills/WaysideOnline.jpg, which the cabinet shows
      videoUrl: "/game-recordings/WaysideOnline.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Wayside Online"
          url="/wayside-online"
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: "Wayside Gallery",
      cartridge: {
        color: "#b8894f",
        tagline: "Walk through a gallery of Stewart's art.",
        font: { family: "Cormorant Garamond", weight: 600 },
        about: { released: "2026", players: "Single player", genre: "Virtual gallery", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/WaysideGallery.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Wayside Gallery"
          url={WAYSIDE_GALLERY_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: "Picto Box",
      cartridge: {
        color: "#e8853a",
        tagline: "Snap a picto. Hang it on the wall for a day.",
        font: { family: "Chewy" },
        about: { released: "2026", players: "Everyone", genre: "Community camera", developer: "sclondon" },
        backNote: "Say cheese!",
        cassette: "Picto Box",
      },
      videoUrl: "/game-recordings/PictoBoxLogo.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Picto Box"
          url={PICTO_BOX_URL}
          desktopAspectRatio={4 / 5}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          allow="camera"
        />
      ),
    },
    {
      // Where the shelf starts (the non-game carts sit to its left)
      name: "Shuffle",
      cartridge: {
        color: "#f2c14e",
        tagline: "Plays a random game.",
        font: { family: "Bungee" },
        about: { released: "2026", players: "Single player", genre: "Any of them", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/Shuffle.mp4",
      hasLeaderboard: false,
      special: "shuffle",
      game: null,
    },
    {
      name: "8 Bit Evil Returns",
      cartridge: {
        color: "#e0433b",
        tagline: "The pixel nightmare is back.",
        font: { family: "Press Start 2P" },
        about: { released: "2024", players: "Single player", genre: "Retro action", developer: "sclondon + scarbone98" },
        backNote: "Beat it with the lights off. Twice.",
      },
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
      cartridge: {
        color: "#3fb68b",
        tagline: "Climb out from the deep.",
        font: { family: "Cinzel Decorative", weight: 700 },
        about: { released: "2024", players: "Single player", genre: "Vertical platformer", developer: "sclondon" },
        backNote: "Don't look down past floor 40. Something looks back.",
      },
      videoUrl: "/game-recordings/HemlocksTower.mp4",
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
      cartridge: {
        color: "#2f86d6",
        tagline: "Pinball under a storm god’s curse.",
        font: { family: "Tilt Warp" },
        about: { released: "2025", players: "Single player", genre: "Pinball", developer: "scarbone98" },
        backNote: "Tilt it during a storm. Trust me.",
      },
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
      cartridge: {
        color: "#f2a93b",
        tagline: "Dash for the high score.",
        font: { family: "Russo One" },
        about: { released: "2024", players: "Single player", genre: "Endless runner", developer: "scarbone98" },
      },
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
      cartridge: {
        color: "#f07a5a",
        tagline: "Race a salmon down a jungle river.",
        font: { family: "Luckiest Guy" },
        about: { released: "2026", players: "Single player", genre: "Trick racer", developer: "sclondon" },
        backNote: "Up up down down flip flip. Works on the 3rd river.",
      },
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
      cartridge: {
        color: "#a86ee0",
        tagline: "Tiny games, faster and faster.",
        font: { family: "Titan One" },
        about: { released: "2026", players: "Single player", genre: "Microgames", developer: "sclondon" },
        backNote: "If it asks you a question, lie.",
      },
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
      cartridge: {
        color: "#7d8a99",
        tagline: "Last one standing wins.",
        font: { family: "Grenze Gotisch", weight: 700 },
        about: { released: "2026", players: "Single player", genre: "Lane card battler", developer: "scarbone98" },
      },
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
      // The monster arena: watch the brawls and bet coins on who wins
      name: "Monster Bash",
      cartridge: {
        color: "#8f2d1f",
        tagline: "Pick a monster. Back it with tickets.",
        font: { family: "Bangers" },
        about: { released: "2026", players: "Everyone watching", genre: "Arena betting", developer: "scarbone98" },
      },
      videoUrl: "/game-recordings/MonsterBash.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Monster Bash"
          url={MONSTER_BASH_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: "Horde Rush",
      cartridge: {
        color: "#c23b5a",
        tagline: "Grow your squad, blast the horde.",
        font: { family: "Black Ops One" },
        about: { released: "2026", players: "Single player", genre: "Crowd-runner shooter", developer: "scarbone98" },
      },
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
      cartridge: {
        color: "#6cc04a",
        tagline: "Roll a frog through dream worlds.",
        font: { family: "Fredoka", weight: 600 },
        about: { released: "2026", players: "Single player", genre: "Rolling platformer", developer: "scarbone98" },
      },
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
      name: "Mystery Crypt",
      cartridge: {
        color: "#5b3a8c",
        tagline: "Crawl the crypt, recruit the monsters.",
        font: { family: "Creepster" },
        about: { released: "2026", players: "Single player", genre: "Dungeon crawler", developer: "scarbone98" },
        backNote: "The 4th door on the left was never there.",
      },
      videoUrl: "/game-recordings/MysteryCrypt.mp4",
      game: (
        <GameRenderer
          title="Mystery Crypt"
          url={MYSTERY_CRYPT_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Mystery Crypt", MYSTERY_CRYPT_URL)
          }
        />
      ),
    },
    {
      name: "Ghost Ridge",
      cartridge: {
        color: "#2b2150",
        tagline: "Shred the haunted mountain.",
        font: { family: "Nosifer" },
        about: { released: "2026", players: "Single player", genre: "Snowboarding", developer: "scarbone98" },
      },
      videoUrl: "/game-recordings/GhostRidge.mp4",
      game: (
        <GameRenderer
          title="Ghost Ridge"
          url={GHOST_RIDGE_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Ghost Ridge", GHOST_RIDGE_URL)
          }
        />
      ),
    },
    {
      name: "Muertos",
      cartridge: {
        color: "#7a0c0a",
        tagline: "Survive the night in Old San Juan.",
        font: { family: "Black Ops One" },
        about: { released: "2026", players: "Single player", genre: "Zombie survival shooter", developer: "scarbone98" },
        backNote: "Property of the night shift. DO NOT RETURN.",
      },
      videoUrl: "/game-recordings/Muertos.mp4",
      game: (
        <GameRenderer
          title="Muertos"
          url={MUERTOS_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Muertos", MUERTOS_URL)
          }
        />
      ),
    },
    {
      name: "Deep Time",
      cartridge: {
        color: "#4d5e3a",
        tagline: "Steal dinosaur eggs. Make quota. Buy hats.",
        font: { family: "VT323" },
        about: { released: "2026", players: "Single player", genre: "Prehistoric heist horror", developer: "scarbone98" },
        backNote: "It can't see you. Stand still.",
      },
      videoUrl: "/game-recordings/DeepTime.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Deep Time"
          url={DEEP_TIME_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: "BOB",
      cartridge: {
        color: "#f4f1e8",
        tagline: "Look after a stick figure.",
        font: { family: "Patrick Hand" },
        about: { released: "2026", players: "Single player", genre: "Virtual pet sandbox", developer: "sclondon" },
      },
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
      name: "Snow Globe",
      cartridge: {
        color: "#8fc9e8",
        tagline: "Build a snow globe, then shake it.",
        font: { family: "Mountains of Christmas", weight: 700 },
        about: { released: "2026", players: "Single player", genre: "Toy sandbox", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/SnowGlobe.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Snow Globe"
          url={SNOW_GLOBE_URL}
          allow="accelerometer; gyroscope"
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: "Breedable Monsters",
      cartridge: {
        color: "#3fc6c9",
        tagline: "Breed polymons, sell them, save the lab.",
        font: { family: "Share Tech Mono" },
        about: { released: "2026", players: "Single player", genre: "Breeding sim", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/BreedableMonsters.mp4",
      // Right-drag to orbit and drag-and-drop between tanks need a mouse
      availableOnMobile: false,
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Breedable Monsters"
          url={BREEDABLE_MONSTERS_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: "The Simulatrix",
      cartridge: {
        color: "#3de0c4",
        tagline: "A pocket physics lab. Poke the universe.",
        font: { family: "Orbitron", weight: 700 },
        about: { released: "2026", players: "Single player", genre: "Physics sandbox", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/Simulatrix.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="The Simulatrix"
          url={SIMULATRIX_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    {
      name: ORIGINAL_EIGHT_BIT_EVIL,
      cartridge: {
        color: "#9e2f2a",
        tagline: "Where it all began.",
        font: { family: "Silkscreen" },
        about: { released: "Before 2024", players: "Single player", genre: "Retro action", developer: "sclondon + scarbone98" },
        backNote: "Where it all began. Mine, 1986 - J.",
      },
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
    {
      name: "Jack O'Lantern",
      cartridge: {
        color: "#f07a1f",
        tagline: "Grow it, carve it, light it up.",
        font: { family: "Butcherman" },
        about: { released: "2026", players: "Single player", genre: "Pumpkin carving", developer: "sclondon" },
        backNote: "Mirror on for matching eyes.",
      },
      videoUrl: "/game-recordings/JackOLanternForest.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Jack O'Lantern"
          url={JACK_O_LANTERN_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    // --- Secret: in testing, only on the shelf once you've typed LIQUID into WaysideOS
    {
      name: "Liquid Metal",
      secret: true,
      cartridge: {
        color: "#aeb9c8",
        tagline: "Run as a blob of liquid metal. Swipe, duck, dodge.",
        font: { family: "Audiowide" },
        about: { released: "2026", players: "Single player", genre: "Runner", developer: "sclondon" },
        backNote: "test area",
      },
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Liquid Metal"
          url={LIQUID_METAL_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        />
      ),
    },
    // --- Secret: in testing, only on the shelf once you've typed EVILV2 into WaysideOS.
    // It's sent the player's session for its own save (/8bitevilreturns/v2/save), which
    // never touches the Unity game's silver and unlocks. No scores while it's in testing.
    {
      name: "8 Bit Evil Returns V2",
      secret: true,
      cartridge: {
        color: "#7a2fd6",
        tagline: "The pixel nightmare, rebuilt. Survive the horde.",
        font: { family: "Press Start 2P" },
        about: { released: "2026", players: "Single player", genre: "Survival", developer: "scarbone98" },
        backNote: "test area",
      },
      videoUrl: "/game-recordings/8BitEvilReturnsV2.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="8 Bit Evil Returns V2"
          url={EIGHT_BIT_EVIL_RETURNS_V2_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => sendSessionWhenReady(iframe, EIGHT_BIT_EVIL_RETURNS_V2_URL)}
        />
      ),
    },
    // --- Coming soon: carts on the shelf before their games exist. There's no
    // video, just a cover (the URL finds stills/<Name>.jpg); plugged in, the
    // screen says COMING SOON and nothing launches.
    {
      name: "Fury From The Tomb",
      cartridge: {
        color: "#c9a24a",
        tagline: "The book's cursed tomb, awake at last.",
        font: { family: "Cinzel", weight: 700 },
        about: { released: "Coming soon", players: "Single player", genre: "Adventure", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/FuryFromTheTomb.mp4",
      hasLeaderboard: false,
      special: "soon",
      game: null,
    },
    {
      name: "Satellite Sim",
      cartridge: {
        color: "#4a8cff",
        tagline: "Real satellites, circling the Earth, live.",
        font: { family: "Audiowide" },
        about: { released: "Coming soon", players: "Single player", genre: "Simulation", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/SatelliteSim.mp4",
      hasLeaderboard: false,
      special: "soon",
      game: null,
    },
    {
      name: "Depth",
      cartridge: {
        color: "#3fd8e8",
        tagline: "Go down. Keep going down.",
        font: { family: "Pixelify Sans", weight: 700 },
        about: { released: "Coming soon", players: "Single player", genre: "Metroidvania", developer: "sclondon" },
      },
      videoUrl: "/game-recordings/Depth.mp4",
      hasLeaderboard: false,
      special: "soon",
      game: null,
    },
    {
      name: "???",
      cartridge: {
        color: "#3a2a5c",
        tagline: "ERROR READING CARTRIDGE",
        backTape: "0ct0VL",
        font: { family: "Creepster" },
        about: { released: "UNKNOWN", players: "UNKNOWN", genre: "UNKNOWN", developer: "UNKNOWN" },
      },
      // There's no video: the cabinet draws this one's screen live (ArcadeV2/mysteryScreen.ts).
      // The URL is only there to find its label picture, stills/Mystery.jpg.
      videoUrl: "/game-recordings/Mystery.mp4",
      hasLeaderboard: false,
      special: "mystery",
      game: null,
    },
  ];
  // Secret carts stay off the shelf until they're unlocked on this device
  return games.filter((game) => !game.secret || unlocked.includes(game.name));
}

// Shuffle's pick: any real game in the list (on phones, the list already
// leaves out the ones that need a desktop)
export function pickShuffleGame(games: MachineData[]) {
  const playable = games.filter((game) => !game.special);
  return playable[Math.floor(Math.random() * playable.length)];
}
