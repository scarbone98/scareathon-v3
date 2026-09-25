import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FaCheck, FaCopy, FaExclamationTriangle, FaPlay, FaTimes } from "react-icons/fa";
import LoadingSpinner from "../../components/LoadingSpinner";
import { fetchWithAuth } from "../../fetchWithAuth";
import ArcadePlayOverlay from "../Arcade/ArcadePlayOverlay.tsx";
import type { MachineData } from "../Arcade/games.tsx";
import { communityGameToMachine, type CommunityManifest } from "../Arcade/communityGames.tsx";
import { formatLeaderboardScore } from "../Arcade/leaderboard.ts";
import {
  ArcadeApiError,
  arcadeApi,
  buttonClass,
  formatDate,
  primaryButtonClass,
  Section,
  type Check,
} from "./ui.tsx";

// The profile's Developer tab (/profile/developer): make games for the arcade.
// Set up your AI with the public MCP server
// (github.com/scarbone98/scareathon-arcade-mcp; it signs in through
// /arcade/connect), follow your submissions, their play stats and reviews,
// play your drafts, or submit a manifest by hand. Admins also get the review
// queue here.

const MCP_PACKAGE = "github:scarbone98/scareathon-arcade-mcp";
const MCP_REPO_URL = "https://github.com/scarbone98/scareathon-arcade-mcp";

type GameVersion = {
  id: number;
  version: number;
  status: "draft" | "approved" | "rejected" | "superseded";
  url: string;
  manifest: CommunityManifest;
  checks: Check[];
  reviewNote: string | null;
  submittedAt: string;
  stats: VersionStats;
};
type VersionStats = {
  plays: number;
  players: number;
  finishedRuns: number;
  bestScore: number | null;
  playsLast7Days: number;
};
type GameDetail = { slug: string; name: string; owner: string; liveVersionId: number | null; versions: GameVersion[] };
type ArcadeToken = { id: number; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };
type ReviewItem = { slug: string; name: string; owner: string; isUpdate: boolean; version: GameVersion };

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      {/* One-liners (tokens, commands) wrap; multi-line config keeps its shape and scrolls */}
      <pre
        className={`overflow-x-auto rounded-lg border border-white/10 bg-black/70 p-3 pr-10 text-xs text-orange-50/90 ${
          text.includes("\n") ? "whitespace-pre" : "whitespace-pre-wrap break-all"
        }`}
      >
        {text}
      </pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy"
        className="absolute right-2 top-2 rounded p-1.5 text-orange-100/60 transition hover:bg-white/10 hover:text-orange-50"
      >
        {copied ? <FaCheck /> : <FaCopy />}
      </button>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  live: "border-emerald-400/60 bg-emerald-500/15 text-emerald-200",
  approved: "border-emerald-400/30 bg-emerald-500/5 text-emerald-200/70",
  draft: "border-amber-400/60 bg-amber-500/15 text-amber-200",
  rejected: "border-red-400/60 bg-red-500/15 text-red-200",
  superseded: "border-white/15 bg-white/5 text-orange-100/50",
};

const STATUS_LABELS: Record<string, string> = {
  live: "Live",
  approved: "Approved",
  draft: "Waiting for review",
  rejected: "Rejected",
  superseded: "Replaced",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {checks.map((check) => (
        <li key={check.id} className="flex gap-2">
          <span className={`mt-0.5 shrink-0 ${check.ok ? "text-emerald-400" : check.level === "error" ? "text-red-400" : "text-amber-400"}`}>
            {check.ok ? <FaCheck /> : check.level === "error" ? <FaTimes /> : <FaExclamationTriangle />}
          </span>
          <span className="text-orange-50/85">
            {check.label}
            {check.detail && <span className="block text-xs text-orange-100/55">{check.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- Connect your AI --------------------------------------------------------------------------

function ConnectAiSection() {
  const queryClient = useQueryClient();
  const tokens = useQuery({ queryKey: ["arcade", "tokens"], queryFn: () => arcadeApi<ArcadeToken[]>("/arcade/tokens") });
  const disconnect = useMutation({
    mutationFn: (id: number) => arcadeApi(`/arcade/tokens/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["arcade", "tokens"] }),
  });

  const claudeCode = `claude mcp add scareathon-arcade -- npx -y ${MCP_PACKAGE}`;
  const jsonConfig = JSON.stringify(
    { mcpServers: { "scareathon-arcade": { command: "npx", args: ["-y", MCP_PACKAGE] } } },
    null,
    2
  );

  return (
    <Section title="1. Connect your AI">
      <p className="mb-3 text-sm text-orange-50/80">
        The <a className="text-orange-300 underline" href={MCP_REPO_URL} target="_blank" rel="noreferrer">Scareathon Arcade MCP server</a>{" "}
        gives your AI (Claude Code, Claude Desktop, Cursor, ...) the spec and lets it check and submit games as you. Add it
        to your AI app:
      </p>
      <p className="mb-1 text-sm font-semibold text-orange-100">Claude Code</p>
      <CopyBlock text={claudeCode} />
      <p className="mb-1 mt-3 text-sm font-semibold text-orange-100">Claude Desktop, Cursor and other MCP clients</p>
      <CopyBlock text={jsonConfig} />
      <p className="mt-3 text-sm text-orange-50/70">
        Then ask your AI something like: <em>"Make a spooky Scareathon arcade game, host it on GitHub Pages and submit it."</em>{" "}
        The first time, it gives you a link to approve here. There's no password or token to copy, and it can only
        submit and read your games.
      </p>

      <h3 className="mb-2 mt-5 text-sm font-semibold text-orange-100">Connected AIs</h3>
      {tokens.data?.length === 0 && <p className="text-sm text-orange-100/50">None yet.</p>}
      {disconnect.isError && <p className="mb-2 text-sm text-red-300">{disconnect.error.message}</p>}
      {tokens.data && tokens.data.length > 0 && (
        <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
          {tokens.data.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-semibold text-orange-50">{row.name}</span>
                <span className="block text-xs text-orange-100/50">
                  Connected {formatDate(row.createdAt)} · last used {formatDate(row.lastUsedAt)}
                </span>
              </span>
              <button type="button" className={buttonClass} onClick={() => disconnect.mutate(row.id)} disabled={disconnect.isPending}>
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

// --- Your games -------------------------------------------------------------------------------

function StatsLine({ stats, format }: { stats: VersionStats; format?: "points" | "time" }) {
  const best =
    stats.bestScore === null
      ? null
      : format === "time"
        ? formatLeaderboardScore("", stats.bestScore, "time")
        : stats.bestScore.toLocaleString();
  const items = [
    [stats.plays, stats.plays === 1 ? "play" : "plays"],
    [stats.players, stats.players === 1 ? "player" : "players"],
    [stats.finishedRuns, stats.finishedRuns === 1 ? "finished run" : "finished runs"],
  ] as const;
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-orange-100/70">
      {items.map(([value, label]) => (
        <span key={label}>
          <strong className="font-mono tabular-nums text-orange-50">{value.toLocaleString()}</strong> {label}
        </span>
      ))}
      {best !== null && (
        <span>
          best <strong className="font-mono tabular-nums text-yellow-200">{best}</strong>
        </span>
      )}
    </p>
  );
}

function totalStats(versions: GameVersion[]): VersionStats {
  return versions.reduce<VersionStats>(
    (total, { stats }) => ({
      plays: total.plays + stats.plays,
      // A player of two versions counts twice here; close enough for a total
      players: total.players + stats.players,
      finishedRuns: total.finishedRuns + stats.finishedRuns,
      bestScore:
        stats.bestScore === null ? total.bestScore : Math.max(total.bestScore ?? 0, stats.bestScore),
      playsLast7Days: total.playsLast7Days + stats.playsLast7Days,
    }),
    { plays: 0, players: 0, finishedRuns: 0, bestScore: null, playsLast7Days: 0 }
  );
}

function versionStatus(game: { liveVersionId: number | null }, version: GameVersion) {
  return version.id === game.liveVersionId ? "live" : version.status;
}

function VersionRow({
  game,
  version,
  onPlay,
}: {
  game: GameDetail;
  version: GameVersion;
  onPlay: (game: { name: string; owner: string }, version: GameVersion) => void;
}) {
  const [open, setOpen] = useState(version.status === "draft" || version.status === "rejected");
  return (
    <li className="rounded-lg border border-white/10 bg-black/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-orange-100/70">v{version.version}</span>
        <StatusChip status={versionStatus(game, version)} />
        <span className="text-xs text-orange-100/50">{formatDate(version.submittedAt)}</span>
        <span className="ml-auto flex gap-2">
          <button type="button" className={buttonClass} onClick={() => setOpen(!open)}>
            {open ? "Hide" : "Details"}
          </button>
          {version.status !== "superseded" && (
            <button type="button" className={primaryButtonClass} onClick={() => onPlay(game, version)}>
              <FaPlay aria-hidden="true" /> Play
            </button>
          )}
        </span>
      </div>
      {version.status === "approved" && (
        <div className="mt-2">
          <StatsLine stats={version.stats} format={version.manifest.score?.format} />
        </div>
      )}
      {version.reviewNote && (
        <p className="mt-2 rounded border border-red-400/30 bg-red-500/10 px-2 py-1 text-sm text-red-100">
          Reviewer: {version.reviewNote}
        </p>
      )}
      {open && (
        <div className="mt-3 space-y-3">
          <p className="break-all text-xs text-orange-100/60">{version.url}</p>
          <ChecksList checks={version.checks} />
        </div>
      )}
    </li>
  );
}

function MyGamesSection({ onPlay }: { onPlay: (game: { name: string; owner: string }, version: GameVersion) => void }) {
  const games = useQuery({ queryKey: ["arcade", "mine"], queryFn: () => arcadeApi<GameDetail[]>("/arcade/games/mine") });

  return (
    <Section title="2. Your games">
      {games.isLoading && <p className="text-sm text-orange-100/60">Loading…</p>}
      {games.isError && <p className="text-sm text-red-300">{games.error.message}</p>}
      {games.data?.length === 0 && (
        <p className="text-sm text-orange-100/60">Nothing yet. Once you or your AI submits a game it shows up here.</p>
      )}
      <div className="space-y-5">
        {games.data?.map((game) => (
          <div key={game.slug}>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: game.versions[0]?.manifest.color }} />
              <h3 className="font-bold text-orange-50">{game.name}</h3>
              {game.liveVersionId && (
                <Link to={`/arcade?game=${encodeURIComponent(game.name)}`} className="text-xs text-orange-300 underline">
                  On the shelf
                </Link>
              )}
            </div>
            {game.versions.some((version) => version.status === "approved") && (
              <div className="mb-3 rounded-lg border border-white/10 bg-black/30 px-3 py-2">
                <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-wide text-orange-100/50">
                  All versions · {totalStats(game.versions).playsLast7Days.toLocaleString()} plays this week
                </p>
                <StatsLine stats={totalStats(game.versions)} format={game.versions[0]?.manifest.score?.format} />
              </div>
            )}
            <ul className="space-y-2">
              {game.versions.map((version) => (
                <VersionRow key={version.id} game={game} version={version} onPlay={onPlay} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

// --- Submit by hand ---------------------------------------------------------------------------

function ManualSubmitSection({ exampleManifest }: { exampleManifest: object }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(() => JSON.stringify(exampleManifest, null, 2));
  const [result, setResult] = useState<{ ok: boolean; message: string; errors?: string[]; checks?: Check[] } | null>(null);

  const run = useMutation({
    mutationFn: async (mode: "validate" | "submit") => {
      let manifest: unknown;
      try {
        manifest = JSON.parse(text);
      } catch {
        throw new ArcadeApiError("That isn't valid JSON");
      }
      if (mode === "validate") {
        const data = await arcadeApi<{ ok: boolean; error?: string; errors?: string[]; checks?: Check[]; wouldCreate?: string }>(
          "/arcade/games/validate",
          { method: "POST", body: { manifest } }
        );
        return data.ok
          ? { ok: true, message: `Looks good: submitting would make a ${data.wouldCreate}.`, checks: data.checks }
          : { ok: false, message: data.error ?? "Not valid", errors: data.errors, checks: data.checks };
      }
      const game = await arcadeApi<GameDetail>("/arcade/games", { method: "POST", body: { manifest } });
      queryClient.invalidateQueries({ queryKey: ["arcade", "mine"] });
      return { ok: true, message: `Submitted ${game.name} v${game.versions[0].version} as a draft.`, checks: game.versions[0].checks };
    },
    onSuccess: setResult,
    onError: (error) => {
      const details = error instanceof ArcadeApiError ? error.details : {};
      setResult({ ok: false, message: error.message, ...details });
    },
  });

  return (
    <Section title="Or submit by hand">
      <p className="mb-3 text-sm text-orange-50/80">
        Paste your game's manifest. Submitting again with the same name makes a new version; players keep the last approved
        one until it's reviewed.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={14}
        spellCheck={false}
        className="w-full rounded-lg border border-white/15 bg-black/70 p-3 font-mono text-xs text-orange-50"
        aria-label="Manifest JSON"
      />
      <div className="mt-2 flex gap-2">
        <button type="button" className={buttonClass} onClick={() => run.mutate("validate")} disabled={run.isPending}>
          Check it
        </button>
        <button type="button" className={primaryButtonClass} onClick={() => run.mutate("submit")} disabled={run.isPending}>
          Submit as draft
        </button>
        {run.isPending && <span className="self-center text-sm text-orange-100/60">Checking the URL…</span>}
      </div>
      {result && (
        <div className={`mt-3 rounded-lg border p-3 ${result.ok ? "border-emerald-400/40 bg-emerald-500/10" : "border-red-400/40 bg-red-500/10"}`}>
          <p className="mb-2 text-sm font-semibold text-orange-50">{result.message}</p>
          {result.errors && (
            <ul className="mb-2 list-disc pl-5 text-sm text-red-100">
              {result.errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          )}
          {result.checks && <ChecksList checks={result.checks} />}
        </div>
      )}
    </Section>
  );
}

// --- Admin review ---------------------------------------------------------------------------------

function ReviewSection({ onPlay }: { onPlay: (game: { name: string; owner: string }, version: GameVersion) => void }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const review = useQuery({
    queryKey: ["arcade", "review"],
    queryFn: () => arcadeApi<{ drafts: ReviewItem[]; live: ReviewItem[] }>("/arcade/review"),
  });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => arcadeApi(path, { method: "POST", body: body ?? {} }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arcade"] });
    },
  });

  return (
    <Section title="Admin: review queue">
      {act.isError && <p className="mb-3 text-sm text-red-300">{act.error.message}</p>}
      {review.data?.drafts.length === 0 && <p className="text-sm text-orange-100/60">No drafts waiting.</p>}
      <ul className="space-y-3">
        {review.data?.drafts.map((item) => (
          <li key={item.version.id} className="rounded-lg border border-amber-400/30 bg-black/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="h-3 w-3 rounded-full" style={{ background: item.version.manifest.color }} />
              <span className="font-bold text-orange-50">{item.name}</span>
              <span className="font-mono text-sm text-orange-100/70">v{item.version.version}</span>
              <span className="text-xs text-orange-100/60">
                by {item.owner} · {item.isUpdate ? "update to a live game" : "new game"}
              </span>
            </div>
            <p className="mt-1 text-sm text-orange-50/80">{item.version.manifest.tagline}</p>
            {item.version.manifest.description && (
              <p className="mt-1 text-xs text-orange-100/60">{item.version.manifest.description}</p>
            )}
            <p className="mt-1 break-all text-xs text-orange-100/50">
              {item.version.url} · {item.version.manifest.aspectRatio} · {item.version.manifest.mobile ? "phones too" : "desktop only"} ·{" "}
              {item.version.manifest.score
                ? `${item.version.manifest.score.format} up to ${item.version.manifest.score.max.toLocaleString()}`
                : "no leaderboard"}
            </p>
            <div className="mt-2">
              <ChecksList checks={item.version.checks} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className={buttonClass} onClick={() => onPlay(item, item.version)}>
                <FaPlay aria-hidden="true" /> Play
              </button>
              <input
                value={notes[item.version.id] ?? ""}
                onChange={(event) => setNotes({ ...notes, [item.version.id]: event.target.value })}
                placeholder="Note for the author (needed to reject)"
                className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-sm text-orange-50 placeholder:text-orange-100/35"
              />
              <button
                type="button"
                className={buttonClass}
                disabled={act.isPending || !notes[item.version.id]?.trim()}
                onClick={() => act.mutate({ path: `/arcade/versions/${item.version.id}/reject`, body: { note: notes[item.version.id] } })}
              >
                Reject
              </button>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={act.isPending}
                onClick={() => act.mutate({ path: `/arcade/versions/${item.version.id}/approve`, body: { note: notes[item.version.id] } })}
              >
                Approve
              </button>
            </div>
          </li>
        ))}
      </ul>
      {review.data && review.data.live.length > 0 && (
        <>
          <h3 className="mb-2 mt-5 font-semibold text-orange-100">Live community games</h3>
          <ul className="divide-y divide-white/10 rounded-lg border border-white/10">
            {review.data.live.map((item) => (
              <li key={item.slug} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  <span className="font-semibold text-orange-50">{item.name}</span>{" "}
                  <span className="text-orange-100/60">v{item.version.version} by {item.owner}</span>
                </span>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={act.isPending}
                  onClick={() => {
                    if (window.confirm(`Take ${item.name} off the shelf? Its scores are kept.`)) {
                      act.mutate({ path: `/arcade/games/${item.slug}/unpublish` });
                    }
                  }}
                >
                  Unpublish
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}

// --- Page -----------------------------------------------------------------------------------------

export function DeveloperContent() {
  const [previewMachine, setPreviewMachine] = useState<MachineData | null>(null);
  const [previewScore, setPreviewScore] = useState<number | null>(null);
  const spec = useQuery({
    queryKey: ["arcade", "spec"],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetchWithAuth("/arcade/spec");
      if (!response.ok) throw new Error("Couldn't load the spec");
      return (await response.json()) as { markdown: string; exampleManifest: object };
    },
  });
  const me = useQuery({ queryKey: ["arcade", "me"], queryFn: () => arcadeApi<{ isAdmin: boolean }>("/arcade/me") });

  const playVersion = (game: { name: string; owner: string }, version: GameVersion) => {
    setPreviewScore(null);
    setPreviewMachine(
      communityGameToMachine(
        { name: game.name, owner: game.owner, url: version.url, manifest: version.manifest },
        { onPreviewScore: setPreviewScore }
      )
    );
  };
  const closePreview = () => setPreviewMachine(null);

  useEffect(() => {
    if (!previewMachine) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePreview();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewMachine]);

  return (
    <div className="space-y-6 text-orange-50">
      <p className="text-sm text-orange-50/80">
        Build a browser game, host it anywhere with https, and submit it. It goes in as a draft that only you and the
        admins can play. Once an admin approves it, it's on the <Link to="/arcade" className="text-orange-300 underline">arcade shelf</Link>{" "}
        with its own leaderboard. Updates work the same way: the new version waits for review while players keep the last
        approved one.
      </p>

      <ConnectAiSection />
      <MyGamesSection onPlay={playVersion} />
      {spec.data && <ManualSubmitSection exampleManifest={spec.data.exampleManifest} />}
      {me.data?.isAdmin && <ReviewSection onPlay={playVersion} />}

      <Section title="The spec">
        {spec.isLoading && <LoadingSpinner />}
        {spec.data && (
          <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/60 p-4 text-xs leading-5 text-orange-50/85">
            {spec.data.markdown}
          </pre>
        )}
      </Section>

      {/* The overlay starts below the site nav, which scrolls with this page:
          black out whatever's scrolled into that gap */}
      {previewMachine && <div className="fixed inset-0 z-30 bg-black" />}
      <ArcadePlayOverlay machine={previewMachine} onClose={closePreview} returnPath="/profile/developer" />
      {previewMachine && (
        <div
          role="status"
          className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,30rem)] -translate-x-1/2 rounded-lg border border-amber-400/60 bg-black/90 px-4 py-3 text-sm text-amber-100 shadow-2xl"
        >
          {previewScore === null
            ? "Draft preview: scores aren't saved. Finish a run to check the leaderboard hookup."
            : <>Score received: <strong className="text-amber-300">{previewScore.toLocaleString()}</strong>. The hookup works (not saved: this is a preview).</>}
        </div>
      )}
    </div>
  );
}
