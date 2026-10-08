import type { GameState } from "../../game/sim";
import { fusionStatus, localFusion } from "../../game/u1/combat/fusion";
import "./combat.css";

export function CombatHud({ state, trigger }: { state: GameState; trigger: () => void }) {
  if (!["test", "dungeon", "realm", "arena"].includes(state.scene) || state.overlay) return null;
  const status = fusionStatus(state), form = localFusion(state);
  return <div className="wf-combat-hud" aria-label="Fusion status">
    {form ? <div className="wf-fusion-active" role="status"><strong>FUSION · {Math.ceil(form.remaining)}s</strong><span>{form.specialUsed || state.fusion.spentSpecialIds.includes(form.id) ? "Supernova spent · powered strikes" : form.seats[0] !== (state.coop?.seat ?? 0) ? "Linked form · lead has Supernova" : "Release Ki for Supernova"}</span><meter min={0} max={12} value={form.remaining} aria-label="Fusion time remaining" /></div>
      : <button className="wf-fusion-button" disabled={!status.ready} onClick={trigger} aria-label={`Fuse heroes. ${status.reason}`}><span aria-hidden="true">✦</span><strong>{status.intent > 0 ? "Awaiting partner" : status.cooldown > 0 ? `Fusion · ${Math.ceil(status.cooldown)}s` : "Fuse"}</strong><small>{status.reason} · F / stick click</small></button>}
  </div>;
}
