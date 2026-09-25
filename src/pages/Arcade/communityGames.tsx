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

const PLAYER_KEY_STORAGE = "scareathon:arcade-player";

// Guests are counted by a random id kept in this browser; signed-in players
// by their account (the server ignores this for them)
function guestPlayerKey() {
  try {
    let key = localStorage.getItem(PLAYER_KEY_STORAGE);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(PLAYER_KEY_STORAGE, key);
    }
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

// For the author's play stats. Best effort: a failure never bothers the player.
function recordPlay(slug: string, versionId: number, event: "start" | "finish", score?: number) {
  fetchWithAuth(`/arcade/community/${encodeURIComponent(slug)}/plays`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId, event, score, playerKey: guestPlayerKey() }),
  }).catch(() => {});
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
          // The game was opened: one play
          if (tracked) recordPlay(tracked.slug, tracked.versionId, "start");
          const expectedOrigin = getUrlOrigin(game.url);
          const handleMessage = (event: MessageEvent) => {
            if (!isTrustedGameMessage(iframe, event, expectedOrigin)) return;
            if (!isArcadeMessage(event.data) || event.data.type !== "PLAYER_DIED") return;
            const score = Number(event.data.score);
            if (onPreviewScore) {
              onPreviewScore(score);
              return;
            }
            if (tracked) recordPlay(tracked.slug, tracked.versionId, "finish", Number.isFinite(score) ? score : undefined);
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
