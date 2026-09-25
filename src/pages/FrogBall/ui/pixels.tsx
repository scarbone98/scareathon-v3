// Pixel-art sprites and chunky extruded lettering for Frog Ball's menus and HUD.
import type { CSSProperties } from "react";

type Palette = Record<string, string>;

// Draws a sprite from rows of palette keys ('.' is transparent), `scale`
// virtual pixels per sprite pixel.
export function Pix({ rows, palette, scale = 1, className, style }: { rows: string[]; palette: Palette; scale?: number; className?: string; style?: CSSProperties }) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const rects = [];
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const c = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === c) run++;
      if (c !== "." && palette[c]) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={palette[c]} />);
      x += run;
    }
  }
  return (
    <svg className={className} style={style} width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden>
      {rects}
    </svg>
  );
}

const INK = "#1a1033";

const FROG_ROWS = [
  ".oo......oo.",
  "oeeo....oeeo",
  "oepo....opeo",
  "ogggoooogggo",
  "oggggggggggo",
  "okggggggggko",
  "oggoooooo" + "ggo",
  ".oggyyyyggo.",
  "oGgyyyyyygGo",
  "oGGooooooGGo",
  ".oo......oo.",
];
const FROG_PAL: Palette = { o: INK, e: "#ffffff", p: INK, g: "#5fd35a", G: "#2f9a3c", y: "#e8f7a0", k: "#ff8fb4" };

export function FrogFace({ scale = 1, className }: { scale?: number; className?: string }) {
  return <Pix rows={FROG_ROWS.slice(0, 7)} palette={FROG_PAL} scale={scale} className={className} />;
}

// The mascot: the frog sitting in its glass ball.
const BALL_ROWS = (() => {
  const size = 22;
  const c = (size - 1) / 2;
  const grid: string[][] = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c);
      if (d > 10.6) row.push(".");
      else if (d > 9.6) row.push("o");
      else {
        const hl = Math.hypot(x - 6.5, y - 6.5);
        row.push(hl > 3.2 && hl < 4.4 && x < 8 && y < 8 ? "w" : d > 8.4 ? "c" : "b");
      }
    }
    grid.push(row);
  }
  FROG_ROWS.forEach((r, y) => {
    [...r].forEach((ch, x) => {
      if (ch !== ".") grid[9 + y][5 + x] = ch;
    });
  });
  return grid.map((r) => r.join(""));
})();
const BALL_PAL: Palette = { ...FROG_PAL, b: "#9fe9ff", c: "#6fcdf0", w: "#ffffff" };
// Player 2's pink frog in a rosy ball.
const PINK_BALL_PAL: Palette = { ...BALL_PAL, g: "#ff8fc8", G: "#d0508f", y: "#fff0c8", k: "#ff5fa8", b: "#ffd6ee", c: "#ffb0dc" };

export function FrogBallSprite({ scale = 3, className, pink = false }: { scale?: number; className?: string; pink?: boolean }) {
  return <Pix rows={BALL_ROWS} palette={pink ? PINK_BALL_PAL : BALL_PAL} scale={scale} className={className} />;
}

const FLY_ROWS = ["ww.....ww", "www.o.www", ".wwoooww.", "...ooo...", "....o...."];
export function Fly({ scale = 1, className }: { scale?: number; className?: string }) {
  return <Pix rows={FLY_ROWS} palette={{ w: "#dff6ff", o: "#2a2040" }} scale={scale} className={className} style={{ filter: "drop-shadow(0 0 2px #fff27a)" }} />;
}

const CURSOR_ROWS = ["oo...", "oyo..", "oyyo.", "oyyyo", "oyyo.", "oyo..", "oo..."];
export function Cursor({ scale = 1, className, color = "#ffd23f" }: { scale?: number; className?: string; color?: string }) {
  return <Pix rows={CURSOR_ROWS} palette={{ o: INK, y: color }} scale={scale} className={className} />;
}

const CURSOR_DOWN_ROWS = ["ooooooo", "oyyyyyo", ".oyyyo.", "..oyo..", "...o..."];
export function CursorDown({ scale = 1, className }: { scale?: number; className?: string }) {
  return <Pix rows={CURSOR_DOWN_ROWS} palette={{ o: INK, y: "#ffd23f" }} scale={scale} className={className} />;
}

// The goal gate: an arch on two posts with the GOAL tape.
const GOAL_ROWS = [
  "....oooooooooo....",
  "..oopppppppppppoo.",
  ".opppoooooooooppo.",
  "opppo........oppo.",
  "oppo..........oppo",
  "owwo.oooooooo.owwo",
  "owwo.oppppppo.owwo",
  "owwo.oyyyyyyo.owwo",
  "owwo.oppppppo.owwo",
  "owwo.oooooooo.owwo",
  "owwo..........owwo",
  "owwo..........owwo",
  "owwo..........owwo",
  "owwo..........owwo",
  "oooo..........oooo",
];
export function GoalSprite({ scale = 2 }: { scale?: number }) {
  return <Pix rows={GOAL_ROWS} palette={{ o: INK, p: "#ff5fa8", w: "#fff3c4", y: "#ffffff" }} scale={scale} />;
}

const LOCK_ROWS = ["..ooo..", ".o...o.", ".o...o.", "ooooooo", "oyyyyyo", "oyyoyyo", "oyyyyyo", "ooooooo"];
export function Lock({ scale = 1 }: { scale?: number }) {
  return <Pix rows={LOCK_ROWS} palette={{ o: INK, y: "#ffd23f" }} scale={scale} />;
}

// Chunky letters with a coloured face, a lighter top half, an extruded
// side and an ink outline. anim is one of the fb-a-* letter animations.
export function ArcadeText({
  text,
  size = 16,
  face = "#ffd23f",
  top,
  side = "#c2560a",
  depth,
  anim,
  colors,
  className,
  style,
}: {
  text: string;
  size?: number;
  face?: string;
  top?: string;
  side?: string;
  depth?: number;
  anim?: "drop" | "wave" | "fall" | "title";
  colors?: [string, string, string][]; // per-letter [face, top, side], cycled
  className?: string;
  style?: CSSProperties;
}) {
  const d = depth ?? Math.max(1, Math.round(size / 10));
  const o = Math.max(1, Math.round(size / 20));
  // Earlier shadows paint on top: the outline round the face, then the
  // extruded side, then the outline round the side.
  const shadow = (sideColor: string) => {
    const s: string[] = [`${-o}px ${-o}px 0 ${INK}`, `0 ${-o}px 0 ${INK}`, `${o}px ${-o}px 0 ${INK}`, `${-o}px 0 0 ${INK}`, `${o}px 0 0 ${INK}`];
    for (let k = 1; k <= d; k++) s.push(`0 ${k}px 0 ${sideColor}`);
    for (let k = 0; k <= d; k++) s.push(`${-o}px ${k}px 0 ${INK}`, `${o}px ${k}px 0 ${INK}`);
    s.push(`${-o}px ${d + o}px 0 ${INK}`, `0 ${d + o}px 0 ${INK}`, `${o}px ${d + o}px 0 ${INK}`);
    return s.join(",");
  };
  let li = 0;
  return (
    <span className={`inline-block whitespace-pre ${anim ? `fb-a-${anim}` : ""} ${className ?? ""}`} style={{ fontSize: size, lineHeight: 1, paddingBottom: d + o, ...style }}>
      {[...text].map((ch, i) => {
        if (ch === " ") return <span key={i}> </span>;
        const [f, t, sd] = colors ? colors[li % colors.length] : [face, top ?? lighten(face), side];
        const idx = li++;
        return (
          <span key={i} className="fb-letter" style={{ "--i": idx, color: f, textShadow: shadow(sd) } as CSSProperties}>
            {ch}
            <span aria-hidden className="absolute left-0 top-0" style={{ color: t, clipPath: "inset(0 0 58% 0)", textShadow: "none" }}>
              {ch}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function lighten(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 60);
  const g = Math.min(255, ((n >> 8) & 255) + 60);
  const b = Math.min(255, (n & 255) + 60);
  return `rgb(${r},${g},${b})`;
}
