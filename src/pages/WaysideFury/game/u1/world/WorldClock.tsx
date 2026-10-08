import type { GameState } from "../../sim";
import { sampleDayNight } from "./dayNight";
import { worldCycleSeconds } from "./dayNightRuntime";

export function WorldClock({ state }: { state: GameState }) {
  if (state.scene !== "overworld") return null;
  const sample = sampleDayNight(worldCycleSeconds(state));
  const label = { day: "Day", dusk: "Dusk", night: "Night", dawn: "Dawn" }[sample.phase];
  return <span className="wf-world-clock" aria-label={`Wayside County · ${label}`}><span aria-hidden="true">{sample.nightFactor > .5 ? "☾" : "☀"}</span> {label}</span>;
}
