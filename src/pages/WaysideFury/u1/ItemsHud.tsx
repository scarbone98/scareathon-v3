import type { CSSProperties } from "react";
import type { GameState } from "../game/sim";
import { itemsState } from "../game/u1/items/chips";
import { radarReading, currentRadarArea, type HiddenRadarTarget } from "../game/u1/items/radar";
import "./radar.css";

interface Props {
  state: GameState;
  hiddenTargets?: readonly HiddenRadarTarget[];
  onToggleRadar: () => void;
}

export function ItemsHud({ state, hiddenTargets, onToggleRadar }: Props) {
  const radar = itemsState(state).radar;
  if (!radar.owned || !currentRadarArea(state)) return null;
  const reading = radarReading(state, hiddenTargets);
  const message = !radar.enabled ? "Radar off" : reading ? `${reading.direction} · ${Math.ceil(reading.distanceTiles)} steps` : "No signal";
  const label = !radar.enabled ? "Turn Relic Radar on" : reading ? `Relic Radar on. ${reading.kind === "relic" ? "Relic" : "Hidden find"}, ${reading.direction}, ${Math.ceil(reading.distanceTiles)} steps away. Turn radar off` : "Relic Radar on. No nearby signal in this area. Turn radar off";
  return <aside className={`wf-items-hud ${radar.enabled ? "is-enabled" : ""} ${reading ? "has-signal" : ""}`} aria-label="Relic Radar">
    <button type="button" className="wf-radar-toggle" aria-pressed={radar.enabled} aria-label={label} onClick={onToggleRadar}>
      <span className="wf-radar-dial" aria-hidden="true"><span className="wf-radar-north">N</span>{reading ? <span className="wf-radar-needle" style={{ "--wf-radar-bearing": `${reading.bearing}deg` } as CSSProperties}>↑</span> : <span className="wf-radar-idle">◎</span>}</span>
      <span className="wf-radar-text"><strong>Relic Radar</strong><small>{message}</small></span>
      <span className="wf-radar-led" aria-hidden="true" />
    </button>
  </aside>;
}
