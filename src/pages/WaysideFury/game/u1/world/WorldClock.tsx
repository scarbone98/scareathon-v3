import type { GameState } from "../../sim";
import { DAY_NIGHT_CYCLE_SECONDS, sampleDayNight } from "./dayNight";
import { worldCycleSeconds } from "./dayNightRuntime";

export function WorldClock({ state }: { state: GameState }) {
  if (state.scene !== "overworld") return null;
  const sample = sampleDayNight(worldCycleSeconds(state));
  const label = { day: "Day", dusk: "Dusk", night: "Night", dawn: "Dawn" }[sample.phase];
  const minutes = Math.floor(sample.seconds / DAY_NIGHT_CYCLE_SECONDS * 1440 + 480) % 1440;
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return <span className="wf-world-clock" aria-label={`Wayside County · ${label} · ${time}`}><span aria-hidden="true">{sample.nightFactor > .5 ? "☾" : "☀"}</span> {label} · {time}</span>;
}
