import { useEffect, useMemo, useRef, useState } from "react";
import {
  TICK_RATE,
  getMonster,
  type OddsPoint,
} from "../../../server/shared/monster-bash/index.js";
import type { LiveMatch } from "./matchStore";
import { SIDE_COLORS, formatPercent } from "./theme";

const HEIGHT = 210;
const MARGIN = { top: 14, right: 116, bottom: 26, left: 40 };
const MIN_DOMAIN_SECONDS = 60;
const LABEL_GAP = 30;
const Y_TICKS = [0, 25, 50, 75, 100];

const INK = {
  surface: "#120c16",
  primary: "#f5ecff",
  secondary: "#c9b8dd",
  muted: "#8f7fa6",
  grid: "#2a2233",
};

function formatClock(ticks: number) {
  const seconds = Math.max(0, Math.round(ticks / TICK_RATE));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

// Spreads the two end labels apart when the lines meet, keeping them inside
// the plot. Labels that move away from their dot get a leader line.
function placeLabels(ys: [number, number], top: number, bottom: number): [number, number] {
  const [a, b] = ys;
  if (Math.abs(a - b) >= LABEL_GAP) return ys;
  const mid = Math.min(bottom - LABEL_GAP / 2, Math.max(top + LABEL_GAP / 2, (a + b) / 2));
  return a <= b ? [mid - LABEL_GAP / 2, mid + LABEL_GAP / 2] : [mid + LABEL_GAP / 2, mid - LABEL_GAP / 2];
}

export default function OddsChart({ match, playbackTick }: { match: LiveMatch; playbackTick: number }) {
  const [containerRef, width] = useElementWidth<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const names = match.fighters.map((id) => getMonster(id).name) as [string, string];
  const tick = Math.max(0, playbackTick);

  // Only reveal odds the arena has already shown, so the chart never spoils.
  const points = useMemo<OddsPoint[]>(() => {
    const visible = match.odds.filter((point) => point.t <= tick);
    const last = visible.at(-1);
    if (last && last.t < tick && !(match.result && tick >= match.result.durationTicks)) {
      visible.push({ t: tick, p: last.p });
    }
    return visible;
  }, [match.odds, match.result, tick]);

  const roundMarkers = useMemo(
    () =>
      match.events.filter(
        (event): event is Extract<typeof event, { type: "roundEnd" }> =>
          event.type === "roundEnd" && event.t <= tick
      ),
    [match.events, tick]
  );

  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const lastT = points.at(-1)?.t ?? 0;
  const domainTicks = Math.max(MIN_DOMAIN_SECONDS * TICK_RATE, lastT);
  const x = (t: number) => MARGIN.left + (t / domainTicks) * plotWidth;
  const y = (percent: number) => MARGIN.top + (1 - percent / 100) * plotHeight;
  const sidePercent = (point: OddsPoint, side: number) => (side === 0 ? point.p : 1 - point.p) * 100;

  const current = points.at(-1);
  const xTicks: number[] = [];
  for (let seconds = 0; seconds * TICK_RATE <= domainTicks; seconds += domainTicks > 150 * TICK_RATE ? 30 : 15) {
    xTicks.push(seconds * TICK_RATE);
  }

  const endYs = current
    ? ([y(sidePercent(current, 0)), y(sidePercent(current, 1))] as [number, number])
    : null;
  const labelYs = endYs ? placeLabels(endYs, MARGIN.top, MARGIN.top + plotHeight) : null;
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  const handlePointer = (event: React.PointerEvent<SVGRectElement>) => {
    if (points.length === 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const t = ((event.clientX - bounds.left) / bounds.width) * domainTicks;
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(point.t - t) < Math.abs(points[nearest].t - t)) nearest = index;
    });
    setHoverIndex(nearest);
  };

  const summary = current
    ? `${names[0]} ${formatPercent(current.p)} to win, ${names[1]} ${formatPercent(1 - current.p)}`
    : "Waiting for odds";

  return (
    <section className="rounded-lg border border-purple-900/60 p-4" style={{ background: INK.surface }}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <div>
          <h2 className="text-lg font-bold" style={{ color: INK.primary }}>
            Live odds
          </h2>
          <p className="text-sm" style={{ color: INK.secondary }}>
            Chance to win, recalculated every second of the fight
          </p>
        </div>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legend">
          {names.map((name, side) => (
            <li key={side} className="flex items-center gap-2">
              <span className="inline-block h-0.5 w-4 rounded" style={{ background: SIDE_COLORS[side] }} />
              <span style={{ color: INK.secondary }}>{name}</span>
              {current && (
                <strong className="tabular-nums" style={{ color: INK.primary }}>
                  {formatPercent(side === 0 ? current.p : 1 - current.p)}
                </strong>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div ref={containerRef} className="relative mt-3">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={summary}>
            {Y_TICKS.map((percent) => (
              <g key={percent}>
                <line x1={MARGIN.left} x2={MARGIN.left + plotWidth} y1={y(percent)} y2={y(percent)} stroke={INK.grid} strokeWidth={1} />
                <text x={MARGIN.left - 8} y={y(percent)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={INK.muted} className="tabular-nums">
                  {percent}%
                </text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={x(t)} y={HEIGHT - 6} textAnchor="middle" fontSize={11} fill={INK.muted} className="tabular-nums">
                {formatClock(t)}
              </text>
            ))}

            {roundMarkers.map((marker) => (
              <g key={marker.round}>
                <line x1={x(marker.t)} x2={x(marker.t)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke={INK.muted} strokeWidth={1} opacity={0.6} />
                <text x={x(marker.t) + 4} y={MARGIN.top + 10} fontSize={10} fill={INK.muted}>
                  R{marker.round} {marker.reason === "ko" ? "KO" : "time"}
                </text>
              </g>
            ))}

            {[0, 1].map((side) => (
              <polyline
                key={side}
                fill="none"
                stroke={SIDE_COLORS[side]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.map((point) => `${x(point.t)},${y(sidePercent(point, side))}`).join(" ")}
              />
            ))}

            {hovered && (
              <line x1={x(hovered.t)} x2={x(hovered.t)} y1={MARGIN.top} y2={MARGIN.top + plotHeight} stroke={INK.secondary} strokeWidth={1} />
            )}

            {current && endYs && labelYs &&
              [0, 1].map((side) => {
                const dotX = x(current.t);
                // Labels ride just right of the line's live end, like a ticker.
                const labelX = dotX + 14;
                return (
                  <g key={side}>
                    {Math.abs(labelYs[side] - endYs[side]) > 2 && (
                      <line x1={dotX + 5} y1={endYs[side]} x2={labelX - 4} y2={labelYs[side]} stroke={INK.muted} strokeWidth={1} />
                    )}
                    <circle cx={dotX} cy={endYs[side]} r={4} fill={SIDE_COLORS[side]} stroke={INK.surface} strokeWidth={2} />
                    <text x={labelX} y={labelYs[side] - 3} fontSize={15} fontWeight={700} fill={INK.primary} className="tabular-nums">
                      {formatPercent(side === 0 ? current.p : 1 - current.p)}
                    </text>
                    <text x={labelX} y={labelYs[side] + 11} fontSize={11} fill={INK.secondary}>
                      {names[side]}
                    </text>
                  </g>
                );
              })}

            <rect
              x={MARGIN.left}
              y={MARGIN.top}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              onPointerMove={handlePointer}
              onPointerLeave={() => setHoverIndex(null)}
            />
          </svg>
        )}

        {hovered && (
          <div
            className="pointer-events-none absolute top-2 rounded-md border px-3 py-2 text-sm shadow-lg"
            style={{
              left: Math.min(x(hovered.t) + 10, Math.max(0, width - 170)),
              background: INK.surface,
              borderColor: INK.grid,
            }}
          >
            <div className="text-xs" style={{ color: INK.muted }}>
              {formatClock(hovered.t)} into the fight
            </div>
            {names.map((name, side) => (
              <div key={side} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: SIDE_COLORS[side] }} />
                <strong className="tabular-nums" style={{ color: INK.primary }}>
                  {formatPercent(side === 0 ? hovered.p : 1 - hovered.p)}
                </strong>
                <span style={{ color: INK.secondary }}>{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <details className="mt-2 text-sm" style={{ color: INK.secondary }}>
        <summary className="cursor-pointer select-none">View odds as a table</summary>
        <div className="mt-2 max-h-48 overflow-y-auto">
          <table className="w-full text-left tabular-nums">
            <thead style={{ color: INK.muted }}>
              <tr>
                <th className="py-1 font-normal">Time</th>
                <th className="py-1 font-normal">{names[0]}</th>
                <th className="py-1 font-normal">{names[1]}</th>
              </tr>
            </thead>
            <tbody style={{ color: INK.primary }}>
              {points.map((point) => (
                <tr key={point.t}>
                  <td className="py-0.5">{formatClock(point.t)}</td>
                  <td className="py-0.5">{formatPercent(point.p)}</td>
                  <td className="py-0.5">{formatPercent(1 - point.p)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
