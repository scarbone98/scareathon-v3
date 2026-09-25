// Community games: made by players, submitted from the profile's Developer tab (or their
// AI's scareathon-arcade-mcp server), and put on the shelf once an admin
// approves a version. The server's spec is in server/arcadeCommunity/gameSpec.js.
import { useQuery } from "@tanstack/react-query";
import GameRenderer from "./GameRenderer.tsx";
import {
  GAME_TOOLBAR_HEIGHT,
  getUrlOrigin,
  isArcadeMessage,
  isTrustedGameMessage,
  submitArcadeScore,
  type MachineData,
} from "./games.tsx";
import { markTimeScoreGame } from "./leaderboard.ts";
import { fetchWithAuth } from "../../fetchWithAuth.ts";
import { supabase } from "../../supabaseClient.ts";

export type CommunityManifest = {
  name: string;
  url: string;
  tagline: string;
  color: string;
  aspectRatio: string;
  mobile: boolean;
  description?: string;
  controls?: string;
  coverImageUrl?: string;
  score?: { format: "points" | "time"; max: number; integer: boolean };
};

export type CommunityGame = {
  slug: string;
  name: string;
  owner: string;
  versionId: number;
  version: number;
  url: string;
  manifest: CommunityManifest;
};

// Their own origin (never ours: the server refuses scareathon.rip URLs), so
// allow-same-origin just gives them working storage. No popups or navigating
// the arcade away.
const COMMUNITY_GAME_SANDBOX = "allow-scripts allow-same-origin allow-pointer-lock allow-fullscreen allow-forms";
const COMMUNITY_GAME_ALLOW = "fullscreen; gamepad; accelerometer; gyroscope";

const PLAYER_ID_STORAGE = "scareathon:arcade-player-id";

// Guests are counted by a player id the server signs, kept in this browser.
// Signed-in players are counted by their account and don't need one.
let pendingPlayerId: Promise<string | null> | null = null;

function guestPlayerId(fresh = false): Promise<string | null> {
  if (!fresh) {
    try {
      const saved = localStorage.getItem(PLAYER_ID_STORAGE);
      if (saved) return Promise.resolve(saved);
    } catch {
      // No storage (private mode): ask for one below
    }
  }
  // Games opening at the same moment share one request, so one browser is one player
  pendingPlayerId ??= (async () => {
    try {
      const response = await fetchWithAuth("/arcade/player-id", { method: "POST" });
      if (!response.ok) return null;
      const playerId: string = (await response.json()).data.playerId;
      try {
        localStorage.setItem(PLAYER_ID_STORAGE, playerId);
      } catch {
        // Counted as a new player next visit; fine
      }
      return playerId;
    } catch {
      return null;
    } finally {
      pendingPlayerId = null;
    }
  })();
  return pendingPlayerId;
}

async function postPlay(slug: string, body: object) {
  return fetchWithAuth(`/arcade/community/${encodeURIComponent(slug)}/plays`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// For the author's play stats. Best effort: a failure never bothers the
// player. Returns the play session a "start" hands out, which the "finish"
// events of that play send back.
async function recordPlay(
  slug: string,
  versionId: number,
  event: "start" | "finish",
  extra: { score?: number; playToken?: string } = {}
): Promise<string | undefined> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const playerId = session ? undefined : await guestPlayerId();
    if (!session && !playerId) return undefined;
    let response = await postPlay(slug, { versionId, event, playerId, ...extra });
    // The server's key changed (or the id was tampered with): get a new id once
    if (!session && response.status === 400 && (await response.clone().json()).code === "invalid_player_id") {
      const freshId = await guestPlayerId(true);
      if (!freshId) return undefined;
      response = await postPlay(slug, { versionId, event, playerId: freshId, ...extra });
    }
    if (!response.ok) return undefined;
    return (await response.json()).data?.playToken;
  } catch {
    return undefined;
  }
}

function aspectRatioValue(aspectRatio: string) {
  const [width, height] = aspectRatio.split(":").map(Number);
  return width > 0 && height > 0 ? width / height : 16 / 9;
}

// Shelf games (with slug and versionId) save scores and count plays. Draft
// previews pass onPreviewScore instead: scores go to it and nothing is saved.
export function communityGameToMachine(
  game: Pick<CommunityGame, "name" | "owner" | "url" | "manifest"> & Partial<Pick<CommunityGame, "slug" | "versionId">>,
  options: { onPreviewScore?: (score: number) => void } = {}
): MachineData {
  const { manifest } = game;
  const { onPreviewScore } = options;
  const tracked = !onPreviewScore && game.slug && game.versionId ? { slug: game.slug, versionId: game.versionId } : null;
  return {
    name: game.name,
    byline: game.owner,
    stillUrl: manifest.coverImageUrl,
    availableOnMobile: manifest.mobile,
    hasLeaderboard: Boolean(manifest.score) && !onPreviewScore,
    cartridge: { color: manifest.color, tagline: manifest.tagline },
    game: (
      <GameRenderer
        title={game.name}
        url={game.url}
        sandbox={COMMUNITY_GAME_SANDBOX}
        allow={COMMUNITY_GAME_ALLOW}
        desktopAspectRatio={aspectRatioValue(manifest.aspectRatio)}
        reservedVerticalSpace={GAME_TOOLBAR_HEIGHT}
        onLoad={(iframe) => {
          // The game was opened: one play. Its runs report back with the
          // play session this hands out.
          const playToken = tracked ? recordPlay(tracked.slug, tracked.versionId, "start") : undefined;
          const expectedOrigin = getUrlOrigin(game.url);
          const handleMessage = (event: MessageEvent) => {
            if (!isTrustedGameMessage(iframe, event, expectedOrigin)) return;
            if (!isArcadeMessage(event.data) || event.data.type !== "PLAYER_DIED") return;
            const score = Number(event.data.score);
            if (onPreviewScore) {
              onPreviewScore(score);
              return;
            }
            if (tracked && playToken) {
              void playToken.then((token) =>
                token
                  ? recordPlay(tracked.slug, tracked.versionId, "finish", {
                      score: Number.isFinite(score) ? score : undefined,
                      playToken: token,
                    })
                  : undefined
              );
            }
            if (manifest.score) void submitArcadeScore(game.name, score);
          };
          window.addEventListener("message", handleMessage);
          return () => window.removeEventListener("message", handleMessage);
        }}
      />
    ),
  };
}

// The approved community games, for the shelf. Guests get them too.
export function useCommunityGames() {
  return useQuery<CommunityGame[]>({
    queryKey: ["arcade", "community"],
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const response = await fetchWithAuth("/arcade/community");
      if (!response.ok) throw new Error(`Community games request failed (${response.status})`);
      const games: CommunityGame[] = (await response.json()).data ?? [];
      games.forEach((game) => {
        if (game.manifest.score?.format === "time") markTimeScoreGame(game.name);
      });
      return games;
    },
  });
}
