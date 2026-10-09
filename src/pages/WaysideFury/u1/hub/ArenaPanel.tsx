import { useState } from "react";
import { useLeaderboard } from "../../../Arcade/leaderboard";
import { arenaGame, arenaScore } from "../../../../../server/shared/waysideFury/u1Arena.js";
import type { GameState } from "../../game/sim";
import "./arena.css";

export function ArenaPanel({ state, onStart, onBack }: { state: GameState; onStart: () => void; onBack: () => void }) {
  const [board, setBoard] = useState<"solo" | "coop">(state.coop ? "coop" : "solo");
  const leaderboard = useLeaderboard(arenaGame(board));
  const run = state.arena, finished = run?.status === "finished", personal = state.hubArena;
  return <section className="wf-overlay wf-arena-panel" aria-label="Tournament Arena">
    <p className="wf-eyebrow">WAYSIDE TOURNAMENT · ENDLESS WAVES</p>
    <h2>{finished ? "A run to remember." : "Step into the ring."}</h2>
    {finished && <div className="wf-arena-result"><strong>{arenaScore(run.wavesCleared, run.kills).toLocaleString()}</strong><span>{run.wavesCleared} waves cleared · {run.kills} monsters defeated</span><small>{run.mode === "coop" ? "Co-op board" : "Solo board"} · {run.reason === "defeated" ? "Crew defeated" : "Retired from the ring"}</small></div>}
    <p>Hold the ring through tougher waves: Iron hide, Quick feet, Crossfire, Heavy hitters and a boss every fifth round.</p>
    <p className="wf-small">1,000 points per cleared wave + 100 per monster. Your crew recovers after the run. Tournament tickets use Arcade’s per-run cap and daily taper.</p>
    <div className="wf-arena-bests"><span>SOLO BEST <strong>{(personal?.soloBest ?? 0).toLocaleString()}</strong></span><span>CO-OP BEST <strong>{(personal?.coopBest ?? 0).toLocaleString()}</strong></span></div>
    <button disabled={state.coop?.role === "guest"} onClick={onStart}>{state.coop?.role === "guest" ? "The host starts the tournament" : state.coop ? "Start co-op tournament" : "Start solo tournament"}</button>
    <div className="wf-arena-tabs" role="group" aria-label="Leaderboard mode"><button className="wf-secondary" aria-pressed={board === "solo"} onClick={() => setBoard("solo")}>Solo board</button><button className="wf-secondary" aria-pressed={board === "coop"} onClick={() => setBoard("coop")}>Co-op board</button></div>
    <ol className="wf-arena-board" aria-label={`${board} tournament leaderboard`}>
      {(leaderboard.data ?? []).map((entry, index) => <li key={`${entry.username}-${index}`}><span>{index + 1}. {entry.username}</span><strong>{entry.metricValue.toLocaleString()}</strong></li>)}
    </ol>
    {leaderboard.isLoading && <p className="wf-small">Loading the board…</p>}
    {leaderboard.isError && <p className="wf-small">The board is offline. Your personal best stays saved.</p>}
    {!leaderboard.isLoading && !leaderboard.isError && !leaderboard.data?.length && <p className="wf-small">Be the first to hold the ring.</p>}
    <button className="wf-secondary" onClick={onBack}>Continue to Wayside</button>
  </section>;
}
export function ArenaHud({ state, onRetire }: { state: GameState; onRetire: () => void }) {
  const run = state.arena;
  if (state.scene !== "arena" || !run || run.status !== "running") return null;
  return <aside className="wf-arena-hud" aria-label="Tournament progress"><div><small>{run.mode === "coop" ? "CO-OP TOURNAMENT" : "TOURNAMENT"}</small><strong>Wave {run.wave} <span>{arenaScore(run.wavesCleared, run.kills).toLocaleString()}</span></strong><p>{run.intermission > 0 ? `Next wave in ${Math.ceil(run.intermission)} · ` : ""}{run.modifier}</p></div><button className="wf-secondary" disabled={state.coop?.role === "guest"} onClick={onRetire}>Retire</button></aside>;
}
