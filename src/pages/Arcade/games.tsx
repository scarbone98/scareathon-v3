// The arcade's game list and the plumbing shared by every arcade page:
// score submission, guest-score events, and the mobile check. Add a game here
// once and it shows up in both /arcade and /arcade-v2.
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import GameRenderer from "./GameRenderer.tsx";
import LoadingSpinner from "../../components/LoadingSpinner.tsx";
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";
import { unlockedCarts } from "./unlocks.ts";
import { isNewGame } from "./news.ts";

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
  // Playable but unfinished: EARLY ACCESS over its preview, and shelved in a group of their own.
  earlyAccess?: boolean;
  // When it arrived (an ISO time, like "2026-10-04T16:00:00-06:00"): a "!" badge until it's
  // played, and a finished game's first day is spent in NEW GAMES (Arcade/news.ts)
  added?: string;
  // When it last changed. A hosted game's is read off its build by itself; this is for
  // games served by this site
  updated?: string;
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
export const GAME_TOOLBAR_HEIGHT = 32;
const EIGHT_BIT_EVIL_RETURNS_URL =
  "https://scarbone98.github.io/8BitEvilReturnsBuild/";
const HEMLOCKS_TOWER_URL =
  "https://sclondon.github.io/HemlocksTower/build/HemlocksTower.html?v=10d59b2";
const TLALOCS_CURSE_URL = "https://scarbone98.github.io/tlalocs-curse-pinball/?v=4299a9a";
const OOIDASH_URL =
  "https://scarbone98.github.io/Ooidash-web-remake/build/Ooidash.html?v=d653abc";
const SALMON_RUN_2_URL = "https://sclondon.github.io/SalmonRun2/build/index.html?v=56ec83e";
const WIRTWARE_URL = "https://sclondon.github.io/WirtWare/build/index.html?v=b4274c9";
// Godot auto-battler (Super Autoween), a build-only GitHub Pages repo; ?v= is the build's
// commit, to bust the cache. One page, two packs: phones get half-size art
// (index.mobile.pck), desktops the full set.
const SUPER_AUTOWEEN_URL = "https://perhapsjohn.github.io/SuperAutoween/?v=90b0b37";
const HORDE_RUSH_URL = "/horde-rush";
const MONSTER_BASH_URL = "/monster-bash";
const FROG_BALL_URL = "/frog-ball";
const MYSTERY_CRYPT_URL = "/mystery-crypt";
const GHOST_RIDGE_URL = "/ghost-ridge";
const MUERTOS_URL = "/muertos";
const DEEP_TIME_URL = "https://scarbone98.github.io/deep-time/?v=8f2bcc0";
const HALLOW_DEEP_URL = "https://scarbone98.github.io/hallow-deep/?v=51a535b";
const PICTO_BOX_URL = "/picto-box";
const BOB_URL = "https://sclondon.github.io/BOB/build/index.html?v=4147811";
const SNOW_GLOBE_URL = "https://sclondon.github.io/snowglobe-sim/?v=e6cf5b1";
const WAYSIDE_GALLERY_URL = "https://sclondon.github.io/WaysideGallery/build/index.html?v=c9eff71";
const BREEDABLE_MONSTERS_URL = "https://sclondon.github.io/BreedableMonsters/build/index.html?v=47b15c4";
const SIMULATRIX_URL = "https://sclondon.github.io/Simulatrix/build/index.html?v=ee30791";
const JACK_O_LANTERN_URL = "https://sclondon.github.io/JackOLantern/build/index.html?v=49c4f72";
// The Godot remake (github.com/scarbone98/8BitEvilReturns-godot), in testing.
const EIGHT_BIT_EVIL_RETURNS_V2_URL = "https://scarbone98.github.io/8BitEvilReturns-godot/?v=a83b763";
// Godot daily puzzle (31 Nights), a build-only GitHub Pages repo; ?v= is its commit, to bust the cache.
const THIRTY_ONE_NIGHTS_URL = "https://perhapsjohn.github.io/31Nights/?v=a24eeba";
// Godot party game (Trick or Treat Rush): one page that loads phone.pck on phones (touch
// controls, portrait and landscape layouts) and index.pck on desktop. Build-only GitHub
// Pages repo; ?v= is its build commit, to bust the cache.
const TRICK_OR_TREAT_RUSH_URL = "https://perhapsjohn.github.io/TrickOrTreatRush/?v=bce2a03";
const LIQUID_METAL_URL = "https://sclondon.github.io/LiquidMetal/build/index.html?v=68fa5b8";
// Godot .io game: one page that loads a lighter package on phones (index.mobile.pck) and the
// full one on desktop; online rooms go through relay.waysidejunction.com. Posts PLAYER_DIED
// with the night's candy total at midnight; asks for the session (unityReady) to name the
// player's gang after their username. Served from a build-only GitHub Pages repo;
// ?v= is that repo's build commit, to bust the cache.
const TRICK_OR_TREAT_IO_URL = "https://perhapsjohn.github.io/TrickOrTreatIo/?v=d2fc088";
// Godot voxel stealth game (Lawn Order): a small dog sneaks into the neighbours' yards to
// poop on their lawns. Campaign, Arcade modes and online rooms through the Wayside relay. Asks
// for the session (unityReady) to use the signed-in username as its player name and Junction
// login; a finished Paper Route posts its total as PLAYER_DIED. One page, two packs: phones get
// index.mobile.pck (touch controls, a turn-sideways card), desktops index.pck. Build-only
// GitHub Pages repo; ?v= is its commit.
const LAWN_ORDER_URL = "https://perhapsjohn.github.io/LawnOrder/?v=5a6b0d9";
// Godot photo safari (Cryptid Snap): ride a station wagon down a county road on Halloween night
// 1986 and photograph cryptids; online CB Rally (2-4) through the Wayside relay. One page, two
// packs: phones get index.mobile.pck, desktops index.pck. Asks for the session (unityReady) to
// use the username as the CB handle; posts PLAYER_DIED with each single-player report's total.
// Build-only GitHub Pages repo; ?v= is its commit, to bust the cache.
const CRYPTID_SNAP_URL = "https://perhapsjohn.github.io/CryptidSnap/?v=7159456";
// Godot tower defence (Boo Pop TD): a portrait
// layout on phones (the field turned a quarter, shop and upgrades as bottom sheets, its own
// on-screen keyboard), landscape on desktop. One page, two packs: phones get
// index.mobile.pck, desktops index.pck. Asks for the session (unityReady) to use the
// username as the player name; posts PLAYER_DIED when a single-player game ends (win or
// lose) with the last round cleared. Co-op / versus go through the Wayside relay and are
// never scored here. Build-only GitHub Pages repo; ?v= is the repo's build commit.
const BOO_POP_TD_URL = "https://perhapsjohn.github.io/BooPopTD/?v=8fc54f3";
// Godot 3D kart racer (Kart-o'-Lantern): one page, two packs (phones get index.mobile.pck,
// desktops index.pck), touch controls and its own on-screen keyboard; online rooms go
// through relay.waysidejunction.com. Asks for the session (unityReady) to make the
// player's username their racer name; posts PLAYER_DIED with player 1's points at the
// end of a Grand Prix. Build-only GitHub Pages repo; ?v= is its commit.
const KART_O_LANTERN_URL = "https://perhapsjohn.github.io/KartOLantern/?v=3455913";
// Godot 3D platform fighter (Graveyard Smash 3D): one page, two packs (phones get
// index.mobile.pck, desktops index.pck), touch controls, its own on-screen keyboard and
// a turn-sideways card on an upright phone; online rooms go through
// relay.waysidejunction.com. Asks for the session (unityReady) to make the username its
// online name; posts PLAYER_DIED with a Classic run's score when the run ends (cleared or
// given up). Build-only GitHub Pages repo; ?v= is its commit.
const GRAVEYARD_SMASH_3D_URL = "https://perhapsjohn.github.io/GraveyardSmash3D/?v=099fa12";
// Godot co-op potion kitchen (Overbrewed): one page, two packs (phones get index.mobile.pck,
// desktops index.pck), touch controls, its own on-screen keyboard and a turn-sideways card on
// an upright phone; online rooms go through relay.waysidejunction.com. Asks for the session
// (unityReady) and uses the username as the online name (it logs in with it, as a typed name
// would); posts PLAYER_DIED with the crew's coins when an Endless Night run ends.
// Build-only GitHub Pages repo; ?v= is its commit.
const OVERBREWED_URL = "https://perhapsjohn.github.io/Overbrewed/?v=c441d7e";
// Godot Halloween dungeon crawler (Ghauntlet): one page, two packs (phones get
// index.mobile.pck, desktops index.pck), touch controls and a turn-sideways card on an
// upright phone; online rooms go through relay.waysidejunction.com. Asks for the session
// (unityReady) and uses the username as the online name (it logs in with it, as a typed
// name would, unless the player already signed in by name); posts PLAYER_DIED with the
// last floor's score when an Endless Crypt run ends. Build-only GitHub Pages repo; ?v= is
// its commit.
const GHAUNTLET_URL = "https://perhapsjohn.github.io/Ghauntlet/?v=ef9b2d8";

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
        cassette: "Gallery",
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
        about: { released: "2024", players: "Multiplayer", genre: "Retro action", developer: "sclondon + scarbone98" },
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
          desktopAspectRatio={16 / 9}
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
      videoUrl: "/game-recordings/TlalocsCursePinball.mp4",
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
    // Godot auto-battler: build a crew of spooky critters in the shop, they fight on their
    // own. A finished Arena/Practice run reports its skulls (0-10 battles won) as PLAYER_DIED.
    // Online play (versus rooms, ghosts) runs through relay.waysidejunction.com.
    {
      name: "Super Autoween",
      added: "2026-10-04T15:29:21-06:00",
      cartridge: {
        color: "#4a1f5c",
        tagline: "Build a crew of creepy critters. Survive till dawn.",
        font: { family: "Chewy" },
        about: { released: "2026", players: "1-2 players", genre: "Auto-battler", developer: "perhapsJohn" },
        backNote: "Three of a kind levels up. Freeze the good ones.",
      },
      videoUrl: "/game-recordings/SuperAutoween.mp4",
      game: (
        <GameRenderer
          title="Super Autoween"
          url={SUPER_AUTOWEEN_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) =>
            listenForPlayerDiedScores(iframe, "Super Autoween", SUPER_AUTOWEEN_URL)
          }
        />
      ),
    },
    {
      name: "Crypt Clash",
      earlyAccess: true,
      cartridge: {
        color: "#7d8a99",
        tagline: "Last one standing wins.",
        font: { family: "Grenze Gotisch", weight: 700 },
        about: { released: "2026", players: "Multiplayer", genre: "Lane card battler", developer: "scarbone98" },
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
      earlyAccess: true,
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
      earlyAccess: true,
      cartridge: {
        color: "#6cc04a",
        tagline: "Roll a frog through dream worlds.",
        font: { family: "Fredoka", weight: 600 },
        about: { released: "2026", players: "Multiplayer", genre: "Rolling platformer", developer: "scarbone98" },
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
      earlyAccess: true,
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
      earlyAccess: true,
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
    // Godot daily puzzle: a new night every October day at 00:00 UTC, four rounds.
    // A finished night's score (0-400, 800 on Halloween) comes back as PLAYER_DIED;
    // the cart also sends the session so the guestbook can offer the player's name.
    {
      name: "31 Nights",
      added: "2026-10-04T15:29:21-06:00",
      cartridge: {
        color: "#e8651c",
        tagline: "One door opens every night until Halloween.",
        font: { family: "Cormorant Garamond", weight: 700 },
        about: { released: "2026", players: "Single player", genre: "Daily puzzle", developer: "perhapsJohn" },
        backNote: "Come back tomorrow night.",
      },
      videoUrl: "/game-recordings/31Nights.mp4",
      game: (
        <GameRenderer
          title="31 Nights"
          url={THIRTY_ONE_NIGHTS_URL}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "31 Nights", THIRTY_ONE_NIGHTS_URL),
            sendSessionWhenReady(iframe, THIRTY_ONE_NIGHTS_URL),
          ]}
        />
      ),
    },
    // Godot party game: 1-4 kids (bots fill the street) race for candy; only candy
    // carried home counts. Online play goes through the shared Wayside relay. A
    // finished night's best local haul comes back as PLAYER_DIED (practice nights don't);
    // it asks for the session (unityReady) to offer the player's username as their name.
    {
      name: "Trick or Treat Rush",
      added: "2026-10-04T15:29:21-06:00",
      cartridge: {
        color: "#ff8a1f",
        tagline: "Only the candy you bring home counts.",
        font: { family: "Baloo 2", weight: 800 },
        about: { released: "2026", players: "1-4 local · online", genre: "Party / push-your-luck", developer: "perhapsJohn" },
        backNote: "Bank it before the dog gets you.",
      },
      videoUrl: "/game-recordings/TrickOrTreatRush.mp4",
      game: (
        <GameRenderer
          title="Trick or Treat Rush"
          url={TRICK_OR_TREAT_RUSH_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Trick or Treat Rush", TRICK_OR_TREAT_RUSH_URL),
            sendSessionWhenReady(iframe, TRICK_OR_TREAT_RUSH_URL),
          ]}
        />
      ),
    },
    // Godot .io game: lead a line of trick-or-treaters, cut off other gangs so they scatter into
    // candy. Solo with bots or online rooms. Score: the night's candy (stash + haul) at midnight.
    {
      name: "Trick or Treat .io",
      added: "2026-10-04T15:29:21-06:00",
      cartridge: {
        color: "#ef8a2b",
        tagline: "Grow your gang. Cut off the big kids.",
        font: { family: "Permanent Marker" },
        about: { released: "2026", players: "1-8 online", genre: ".io", developer: "perhapsJohn" },
        backNote: "Stash at home before midnight.",
      },
      videoUrl: "/game-recordings/TrickOrTreatIo.mp4",
      game: (
        <GameRenderer
          title="Trick or Treat .io"
          url={TRICK_OR_TREAT_IO_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Trick or Treat .io", TRICK_OR_TREAT_IO_URL),
            sendSessionWhenReady(iframe, TRICK_OR_TREAT_IO_URL),
          ]}
        />
      ),
    },
    // Godot voxel stealth: review every lawn on the list (squat in the orange ring), stay out of
    // sight, slip out the gate. Or play the humans and catch the dogs. Score: a finished Paper
    // Route's total (five yards in a row on three catches), 0-100,000.
    {
      name: "Lawn Order",
      added: "2026-10-04T15:29:21-06:00",
      earlyAccess: true,
      cartridge: {
        color: "#5fb84a",
        tagline: "A small dog. A big grudge. Very nice lawns.",
        font: { family: "Sniglet", weight: 800 },
        about: { released: "2026", players: "1-4 online", genre: "Stealth", developer: "perhapsJohn" },
        backNote: "Hold still in the hedge.",
      },
      videoUrl: "/game-recordings/LawnOrder.mp4",
      game: (
        <GameRenderer
          title="Lawn Order"
          url={LAWN_ORDER_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Lawn Order", LAWN_ORDER_URL),
            sendSessionWhenReady(iframe, LAWN_ORDER_URL),
          ]}
        />
      ),
    },
    // Godot tower defence (candy-coloured sheet ghosts down a graveyard path, spooks to stop them). Score: the last round cleared on a single-player run
    // (a Medium win is 60, Hard 80, Impoppable 100; freeplay keeps counting, capped at 200).
    {
      name: "Boo Pop TD",
      added: "2026-10-04T15:29:21-06:00",
      cartridge: {
        color: "#ff8a1f",
        tagline: "Pop every boo before the lanterns go out.",
        font: { family: "Cormorant", weight: 700 },
        about: { released: "2026", players: "1 player · co-op 2-4 · versus online", genre: "Tower defence", developer: "perhapsJohn" },
        backNote: "Keep one lantern lit.",
      },
      videoUrl: "/game-recordings/BooPopTD.mp4",
      game: (
        <GameRenderer
          title="Boo Pop TD"
          url={BOO_POP_TD_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Boo Pop TD", BOO_POP_TD_URL),
            sendSessionWhenReady(iframe, BOO_POP_TD_URL),
          ]}
        />
      ),
    },
    // Godot photo safari: one ride down a county road = one run; Dr. Marsh's report total
    // (the run's case points) comes back as PLAYER_DIED. CB Rally results are never sent.
    {
      name: "Cryptid Snap",
      added: "2026-10-04T15:29:21-06:00",
      cartridge: {
        color: "#ff4f9a",
        tagline: "Thirty-six exposures, one county road, something in the headlights.",
        font: { family: "Bungee" },
        about: { released: "2026", players: "1 player · online CB Rally 2-4", genre: "Photo safari", developer: "perhapsJohn" },
        backNote: "Dead centre. Don't flinch.",
      },
      videoUrl: "/game-recordings/CryptidSnap.mp4",
      game: (
        <GameRenderer
          title="Cryptid Snap"
          url={CRYPTID_SNAP_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Cryptid Snap", CRYPTID_SNAP_URL),
            sendSessionWhenReady(iframe, CRYPTID_SNAP_URL),
          ]}
        />
      ),
    },
    // Godot kart racer: monsters and cryptids on 16 haunted tracks, Grand Prix / Time Trial /
    // VS / Lantern Battle, 1-4 on one screen or online by race code. Score: player 1's points
    // over a four-race Grand Prix (15 for a win, 60 at most).
    {
      name: "Kart-o'-Lantern",
      added: "2026-10-04T15:29:21-06:00",
      earlyAccess: true,
      cartridge: {
        color: "#ff7a1a",
        tagline: "Count Vlad sulks for a full lap if you pass him.",
        font: { family: "Rubik Wet Paint" },
        about: { released: "2026", players: "1-4 local, online by room code", genre: "Kart racing", developer: "perhapsJohn" },
        backNote: "Most points after four races takes the Golden Lantern.",
      },
      videoUrl: "/game-recordings/KartOLantern.mp4",
      game: (
        <GameRenderer
          title="Kart-o'-Lantern"
          url={KART_O_LANTERN_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Kart-o'-Lantern", KART_O_LANTERN_URL),
            sendSessionWhenReady(iframe, KART_O_LANTERN_URL),
          ]}
        />
      ),
    },
    // Godot platform fighter: twenty-five monsters on haunted stages, Versus for 1-4 on one
    // screen, Classic, Events, Bonus courses and online rooms. Score: one Classic run (the
    // Trick or Treat Trail, seven fights) when it ends, cleared or given up; 125,500 at most.
    {
      name: "Graveyard Smash 3D",
      added: "2026-10-04T15:29:21-06:00",
      earlyAccess: true,
      cartridge: {
        color: "#6b3fa0",
        tagline: "Seven fights down the Trick or Treat Trail, then a giant at the Witching Hour.",
        font: { family: "Creepster" },
        about: { released: "2026", players: "1-4 local, online by room code", genre: "Platform fighter", developer: "perhapsJohn" },
        backNote: "Faster KOs and less damage taken score more candy.",
      },
      videoUrl: "/game-recordings/GraveyardSmash3D.mp4",
      game: (
        <GameRenderer
          title="Graveyard Smash 3D"
          url={GRAVEYARD_SMASH_3D_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Graveyard Smash 3D", GRAVEYARD_SMASH_3D_URL),
            sendSessionWhenReady(iframe, GRAVEYARD_SMASH_3D_URL),
          ]}
        />
      ),
    },
    // Godot co-op kitchen: 1-4 monsters brew potions for impatient callers (21 kitchens in 7
    // worlds, Daily Brew, Brew-off, Rush Night with up to 30 brewers, Gremlins), online by room
    // code or with bot helpers. Score: the crew's coins in one Endless Night run (until the
    // third caller walks out); 200,000 at most.
    {
      name: "Overbrewed",
      added: "2026-10-04T21:00:00-05:00",
      earlyAccess: true,
      cartridge: {
        color: "#5fbf3a",
        tagline: "Chop the newt eyes. Watch the cauldron. Wash the flask, there are only four.",
        font: { family: "Rubik Wet Paint" },
        about: { released: "2026", players: "1-4 local, online by room code, up to 30 with bots", genre: "Co-op cooking chaos", developer: "perhapsJohn" },
        backNote: "Endless Night counts coins until the third caller walks out.",
      },
      videoUrl: "/game-recordings/Overbrewed.mp4",
      game: (
        <GameRenderer
          title="Overbrewed"
          url={OVERBREWED_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Overbrewed", OVERBREWED_URL),
            sendSessionWhenReady(iframe, OVERBREWED_URL),
          ]}
        />
      ),
    },
    // Godot dungeon crawler in the spirit of Gauntlet Legends: 1-4 costumed heroes against
    // endless ghouls (five realms with bosses, Endless Crypt, Daily Descent, Horde Night,
    // Candy Clash, Boss Rush), online by room code or with bot friends. Score: an Endless
    // Crypt run's last floor score (coins carried down, kills and haunts on that floor,
    // 500 a floor below the first), sent when the souls run out or the run is quit after
    // floor 1; 500,000 at most.
    {
      name: "Ghauntlet",
      added: "2026-10-04T22:45:00-05:00",
      earlyAccess: true,
      cartridge: {
        color: "#ff7a1a",
        tagline: "Candy keeps them alive. Somebody always shoots the candy.",
        font: { family: "Cormorant Garamond", weight: 700 },
        about: { released: "2026", players: "1-4 players, online or with bots", genre: "Dungeon crawler", developer: "perhapsJohn" },
        backNote: "Endless Crypt counts until the souls run out. 500 a floor.",
      },
      videoUrl: "/game-recordings/Ghauntlet.mp4",
      game: (
        <GameRenderer
          title="Ghauntlet"
          url={GHAUNTLET_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => [
            listenForPlayerDiedScores(iframe, "Ghauntlet", GHAUNTLET_URL),
            sendSessionWhenReady(iframe, GHAUNTLET_URL),
          ]}
        />
      ),
    },
    {
      name: "Deep Time",
      earlyAccess: true,
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
    // --- Secret: in testing, only on the shelf once you've typed HALLOW into WaysideOS.
    // Godot Metroidvania. Sent the player's session so it can fetch their avatar look:
    // the title screen offers "you" alongside the four kids. No scores yet.
    {
      name: "Hallow Deep",
      added: "2026-10-03T16:48:17-07:00",
      secret: true,
      cartridge: {
        color: "#3a1f4d",
        tagline: "Find Rowan. Find the seed. Don't breathe too loud.",
        font: { family: "Press Start 2P" },
        about: { released: "2026", players: "Single player", genre: "Metroidvania", developer: "scarbone98" },
        backNote: "Pick a kid, or go down as yourself.",
      },
      videoUrl: "/game-recordings/HallowDeep.mp4",
      hasLeaderboard: false,
      game: (
        <GameRenderer
          title="Hallow Deep"
          url={HALLOW_DEEP_URL}
          desktopAspectRatio={16 / 9}
          reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
          onLoad={(iframe) => sendSessionWhenReady(iframe, HALLOW_DEEP_URL)}
        />
      ),
    },
    {
      name: "BOB",
      earlyAccess: true,
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
      earlyAccess: true,
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
      earlyAccess: true,
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
      added: "2026-10-01T23:30:42-06:00",
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
      added: "2026-10-02T17:20:18-07:00",
      secret: true,
      cartridge: {
        color: "#7a2fd6",
        tagline: "The pixel nightmare, rebuilt. Survive the horde.",
        font: { family: "Press Start 2P" },
        about: { released: "2026", players: "Multiplayer", genre: "Survival", developer: "scarbone98" },
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
  // Secret carts stay off the shelf until they're unlocked on this device. The shelf runs
  // group by group, each in alphabetical order (Shuffle leads the finished games, "???" ends them)
  const edge = (game: MachineData) => (game.special === "shuffle" ? -1 : game.special === "mystery" ? 1 : 0);
  return games
    .filter((game) => !game.secret || unlocked.includes(game.name))
    .sort((a, b) => shelfGroupOf(a) - shelfGroupOf(b) || edge(a) - edge(b) || byName(a, b));
}

// The shelf's groups, left to right, with a wider gap between one and the next: the cassette
// carts (things to do), new games (finished ones, for their first day), the finished games
// ("???" among them), early access, and coming soon
export function shelfGroupOf(game: MachineData) {
  if (game.special === "mystery") return 2;
  if (game.special === "soon") return 4;
  if (game.earlyAccess) return 3;
  if (game.cartridge.cassette) return 0;
  return isNewGame(game) ? 1 : 2;
}

// Alphabetical order, leaving a leading "The" out of it and counting 2 before 10
export function byName(a: MachineData, b: MachineData) {
  const key = (game: MachineData) => game.name.replace(/^the /i, "");
  return key(a).localeCompare(key(b), undefined, { numeric: true, sensitivity: "base" });
}

// Shuffle's pick: any real game in the list (on phones, the list already
// leaves out the ones that need a desktop)
export function pickShuffleGame(games: MachineData[]) {
  const playable = games.filter((game) => !game.special);
  return playable[Math.floor(Math.random() * playable.length)];
}
