// The Hippo Rapids level editor: a top-down map of the river. Shape the banks, drop things on
// the water, set checkpoints, then test it with bots, check that it can be finished, save it and
// share it as a code.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ITEM_TYPES, STEP, createSim, getCourse, sanitizeLevel, sweeperEnds, logAt, spinnerBars, type Item, type ItemType, type Level } from "../../../server/shared/hippoRapids/index.js";
import { decodeLevel, encodeLevel, fmtTime, newLevelId, type SavedLevel } from "./levels";

type CourseT = ReturnType<typeof getCourse>;
const courseCache = new WeakMap<object, CourseT>();
// Courses are rebuilt only when the level object changes, not every frame.
const courseOf = (l: Level): CourseT => {
  let c = courseCache.get(l);
  if (!c) {
    c = getCourse(l);
    courseCache.set(l, c);
  }
  return c;
};

type Tool = "select" | "river" | "cp" | "label" | "erase" | ItemType;

type Selection = { k: "item"; i: number } | { k: "node"; i: number } | { k: "cp"; i: number } | { k: "label"; i: number } | { k: "finish" } | { k: "vortex" } | null;

// A point where the river's shape is pinned down.
interface Node {
  z: number;
  x: number;
  hw: number;
  flow: number;
}

const TOOLS: { id: Tool; label: string; icon: string; hint: string }[] = [
  { id: "select", label: "Move", icon: "✋", hint: "Click things to select, drag to move. Drag empty water to scroll." },
  { id: "river", label: "River", icon: "🌊", hint: "Drag the diamonds (bends) and dots (banks). Click the river to add a point; Delete removes one." },
  { id: "rock", label: "Boulder", icon: "🪨", hint: "Click to place. Solid, harmless." },
  { id: "mine", label: "Buoy", icon: "🟣", hint: "Spiked buoy: costs a pumpkin." },
  { id: "bumper", label: "Bumper", icon: "🎃", hint: "Pumpkin bumper: flings the raft back." },
  { id: "sweeper", label: "Sweeper", icon: "🪵", hint: "Spiked log turning on a post. Click near a bank." },
  { id: "spinner", label: "Wheel", icon: "🌀", hint: "Paddle wheel, or a spiked propeller (set Hazard)." },
  { id: "log", label: "Log", icon: "➖", hint: "A log sliding across the river." },
  { id: "gator", label: "Gator", icon: "🐊", hint: "A gator patrolling across. Costs a pumpkin." },
  { id: "geyser", label: "Geyser", icon: "⛲", hint: "Bubbles, then blasts the raft away." },
  { id: "lily", label: "Lilies", icon: "🪷", hint: "Lily pads: they gum the raft up." },
  { id: "boost", label: "Boost", icon: "⏩", hint: "Boost pad: a shove downstream." },
  { id: "gate", label: "Lock", icon: "🚪", hint: "Teamwork: a gate that opens when enough hippos fart together (or tap together)." },
  { id: "headwind", label: "Headwind", icon: "🌬", hint: "Teamwork: a headwind only a crew pushing together can climb. Leave a pool before it to rest." },
  { id: "ring", label: "Ring", icon: "⭕", hint: "Fly through for a second off your time." },
  { id: "cp", label: "Flag", icon: "🚩", hint: "Checkpoint: where a sunk raft comes back. Click again to remove." },
  { id: "label", label: "Name", icon: "🏷", hint: "Start of a stretch, named on screen." },
  { id: "erase", label: "Erase", icon: "🧽", hint: "Click anything to delete it." },
];

const FIELD_LABELS: Record<string, string> = { r: "Size", len: "Length", speed: "Speed", phase: "Start angle", half: "Half length", amp: "Swing", period: "Period (s)", bars: "Bars", hazard: "Hazard (1 hurts)", need: "Hippos needed", mode: "Mode (0 hold, 1 taps)", hold: "Hold (s)", count: "Taps needed" };

const blank = (): Level => ({
  v: 1,
  name: "My River",
  finish: 250,
  center: [[-80, 0], [400, 0]],
  width: [[-80, 13], [400, 13]],
  flow: [[-80, 1.1], [400, 1.1]],
  checkpoints: [120],
  sections: [[-80, "The River"]],
  vortex: null,
  items: [],
});

function nodesOf(level: Level): Node[] {
  const course = courseOf(level);
  const zs = [...new Set([...level.center.map((p) => p[0]), ...level.width.map((p) => p[0]), ...level.flow.map((p) => p[0])])].sort((a, b) => a - b);
  return zs.map((z) => ({ z, x: course.centerX(z), hw: course.halfWidth(z), flow: course.def.flow.length ? interpFlow(course.def.flow, z) : 1.2 }));
}

function interpFlow(points: [number, number][], z: number) {
  if (z <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (z <= points[i][0]) {
      const [z0, v0] = points[i - 1];
      const [z1, v1] = points[i];
      const t = (z - z0) / (z1 - z0);
      return v0 + (v1 - v0) * t * t * (3 - 2 * t);
    }
  }
  return points[points.length - 1][1];
}

function withNodes(level: Level, nodes: Node[]): Level {
  const sorted = [...nodes].sort((a, b) => a.z - b.z);
  return { ...level, center: sorted.map((n) => [n.z, n.x]), width: sorted.map((n) => [n.z, n.hw]), flow: sorted.map((n) => [n.z, n.flow]) };
}

const round = (n: number, step = 0.5) => Math.round(n / step) * step;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      <span className="opacity-80">{label}</span>
      {children}
    </label>
  );
}

function Slider({ value, lo, hi, step = 0.05, onChange, onCommit }: { value: number; lo: number; hi: number; step?: number; onChange: (v: number) => void; onCommit: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <input type="range" min={lo} max={hi} step={step} value={value} className="w-28" onChange={(e) => onChange(Number(e.target.value))} onPointerUp={onCommit} onKeyUp={onCommit} />
      <span className="w-10 text-right tabular-nums">{Math.round(value * 100) / 100}</span>
    </span>
  );
}

export interface EditorProps {
  initial: SavedLevel | null;
  onExit: () => void;
  onTest: (saved: SavedLevel) => void;
  onSave: (saved: SavedLevel) => void;
}

export default function Editor({ initial, onExit, onTest, onSave }: EditorProps) {
  const [level, setLevel] = useState<Level>(() => initial?.def ?? blank());
  const [id] = useState(() => initial?.id ?? newLevelId());
  const [tool, setTool] = useState<Tool>("select");
  const [sel, setSel] = useState<Selection>(null);
  const [animate, setAnimate] = useState(true);
  const [msg, setMsg] = useState("Pick a tool, then click the map. Scroll to move down the river.");
  const [code, setCode] = useState<{ text: string; mode: "share" | "import" } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [history, setHistory] = useState<{ stack: string[]; at: number }>(() => ({ stack: [JSON.stringify(initial?.def ?? blank())], at: 0 }));

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const levelRef = useRef(level);
  levelRef.current = level;
  const view = useRef({ z: -30, scale: 8 });
  const drag = useRef<{ kind: "pan" | "item" | "node" | "nodew" | "finish" | "vortex" | "cp" | "tap"; i: number; moved: boolean; dz?: number; dx?: number; px?: number; py?: number; wx?: number; wz?: number } | null>(null);
  // Fingers on the map: two make a pinch (zoom and scroll).
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ dist: number; scale: number; mid: number; z: number } | null>(null);
  const coarse = useRef(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const space = useRef(false);
  const cursor = useRef<[number, number]>([0, 0]);
  const course = useMemo(() => courseOf(level), [level]);
  const nodes = useMemo(() => nodesOf(level), [level]);
  const selRef = useRef(sel);
  selRef.current = sel;
  const toolRef = useRef(tool);
  toolRef.current = tool;

  // --- history ----------------------------------------------------------------------------

  const commit = useCallback((next?: Level) => {
    const l = next ?? levelRef.current;
    const text = JSON.stringify(l);
    setDirty(true);
    setHistory((h) => (h.stack[h.at] === text ? h : { stack: [...h.stack.slice(0, h.at + 1), text].slice(-100), at: Math.min(99, h.at + 1) }));
  }, []);

  const change = useCallback(
    (fn: (l: Level) => Level, save = true) => {
      const next = fn(levelRef.current);
      levelRef.current = next;
      setLevel(next);
      if (save) commit(next);
    },
    [commit],
  );

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.at === 0) return h;
      const at = h.at - 1;
      const l = JSON.parse(h.stack[at]) as Level;
      levelRef.current = l;
      setLevel(l);
      setSel(null);
      return { ...h, at };
    });
  }, []);
  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.at >= h.stack.length - 1) return h;
      const at = h.at + 1;
      const l = JSON.parse(h.stack[at]) as Level;
      levelRef.current = l;
      setLevel(l);
      setSel(null);
      return { ...h, at };
    });
  }, []);

  // --- editing ------------------------------------------------------------------------------

  const deleteSelected = useCallback(() => {
    const s = selRef.current;
    if (!s) return;
    if (s.k === "item") change((l) => ({ ...l, items: l.items.filter((_, i) => i !== s.i) }));
    else if (s.k === "cp") change((l) => ({ ...l, checkpoints: l.checkpoints.filter((_, i) => i !== s.i) }));
    else if (s.k === "label") change((l) => ({ ...l, sections: l.sections.length > 1 ? l.sections.filter((_, i) => i !== s.i) : l.sections }));
    else if (s.k === "node") {
      const ns = nodesOf(levelRef.current);
      if (ns.length > 2) change((l) => withNodes(l, ns.filter((_, i) => i !== s.i)));
      else setMsg("A river needs at least two points.");
    } else if (s.k === "vortex") change((l) => ({ ...l, vortex: null }));
    setSel(null);
  }, [change]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.getAttribute("type") !== "range") return;
      if (e.code === "Space") {
        space.current = true;
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.code === "KeyY") {
        e.preventDefault();
        redo();
      } else if (e.code === "Delete" || e.code === "Backspace") {
        e.preventDefault();
        deleteSelected();
      } else if (e.code === "Escape") {
        setSel(null);
        setTool("select");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") space.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [undo, redo, deleteSelected]);

  // --- the map ----------------------------------------------------------------------------

  const toWorld = (px: number, py: number): [number, number] => {
    const cv = canvas.current!;
    const r = cv.getBoundingClientRect();
    const { z, scale } = view.current;
    return [(px - r.left - r.width / 2) / scale, z + (r.height - 40 - (py - r.top)) / scale];
  };

  useEffect(() => {
    let raf = 0;
    const cv = canvas.current!;
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const box = wrap.current!.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(box.width * dpr) || cv.height !== Math.round(box.height * dpr)) {
        cv.width = Math.round(box.width * dpr);
        cv.height = Math.round(box.height * dpr);
      }
      const g = cv.getContext("2d")!;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = box.width;
      const h = box.height;
      const { z: z0, scale } = view.current;
      const sx = (x: number) => w / 2 + x * scale;
      const sy = (z: number) => h - 40 - (z - z0) * scale;
      const zTop = z0 + (h - 40) / scale + 4;
      const zBot = z0 - 40 / scale - 4;
      const L = levelRef.current;
      const c = courseOf(L);
      const t = animate ? now / 1000 : 0;

      g.fillStyle = "#3f7d3a";
      g.fillRect(0, 0, w, h);
      // The river.
      g.beginPath();
      for (let z = Math.max(-60, Math.floor(zBot / 2) * 2); z <= zTop; z += 2) g.lineTo(sx(c.centerX(z) - c.halfWidth(z)), sy(z));
      for (let z = Math.min(zTop, L.finish + 100); z >= Math.max(-60, Math.floor(zBot / 2) * 2); z -= 2) g.lineTo(sx(c.centerX(z) + c.halfWidth(z)), sy(z));
      g.closePath();
      g.fillStyle = "#2b8fe0";
      g.fill();
      g.strokeStyle = "#7fc24a";
      g.lineWidth = 3;
      g.stroke();
      // Current arrows.
      g.strokeStyle = "rgba(255,255,255,0.25)";
      g.lineWidth = 2;
      for (let z = Math.max(0, Math.ceil(zBot / 12) * 12); z <= Math.min(zTop, L.finish); z += 12) {
        const f = c.flowAt(c.centerX(z), z)[1];
        for (const dx of [-0.5, 0, 0.5]) {
          const x = sx(c.centerX(z) + dx * c.halfWidth(z) * 1.2);
          const len = Math.min(18, 5 + f * 4);
          g.beginPath();
          g.moveTo(x, sy(z));
          g.lineTo(x, sy(z) - len);
          g.lineTo(x - 3, sy(z) - len + 4);
          g.moveTo(x, sy(z) - len);
          g.lineTo(x + 3, sy(z) - len + 4);
          g.stroke();
        }
      }
      // Distance grid.
      g.font = "10px sans-serif";
      g.textAlign = "left";
      for (let z = Math.max(0, Math.ceil(zBot / 25) * 25); z <= zTop; z += 25) {
        g.fillStyle = "rgba(255,255,255,0.35)";
        g.fillRect(4, sy(z), 8, 1);
        g.fillText(`${z}m`, 16, sy(z) + 3);
      }
      // Start, finish, checkpoints, stretch names.
      const hline = (z: number, color: string, label: string, dash = false) => {
        g.save();
        g.strokeStyle = color;
        g.lineWidth = 3;
        if (dash) g.setLineDash([8, 6]);
        g.beginPath();
        g.moveTo(sx(c.centerX(z) - c.halfWidth(z)), sy(z));
        g.lineTo(sx(c.centerX(z) + c.halfWidth(z)), sy(z));
        g.stroke();
        g.restore();
        g.fillStyle = color;
        g.font = "bold 11px sans-serif";
        g.fillText(label, sx(c.centerX(z) + c.halfWidth(z)) + 6, sy(z) + 4);
      };
      hline(14, "#ffe45e", "START");
      hline(L.finish, "#ff7ac0", "FINISH");
      L.checkpoints.forEach((z, i) => hline(z, sel?.k === "cp" && sel.i === i ? "#fff" : "#7cff8a", `FLAG ${i + 1}`, true));
      L.sections.forEach(([z, name], i) => {
        g.fillStyle = sel?.k === "label" && sel.i === i ? "#fff" : "#ffe9b0";
        g.font = "bold 11px sans-serif";
        g.textAlign = "right";
        g.fillText(`▸ ${name}`, sx(c.centerX(z) - c.halfWidth(z)) - 6, sy(Math.max(z, 0)) - 4);
        g.textAlign = "left";
      });
      if (L.vortex && c.vortex) {
        g.strokeStyle = sel?.k === "vortex" ? "#fff" : "rgba(255,255,255,0.7)";
        g.setLineDash([4, 4]);
        g.beginPath();
        g.arc(sx(c.vortex.x), sy(c.vortex.z), c.vortex.r * scale, 0, Math.PI * 2);
        g.stroke();
        g.setLineDash([]);
        g.fillStyle = "rgba(255,255,255,0.7)";
        g.fillText("WHIRLPOOL", sx(c.vortex.x) - 28, sy(c.vortex.z) + 4);
      }
      // The raft, for scale.
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.setLineDash([3, 3]);
      g.beginPath();
      g.arc(sx(c.centerX(0)), sy(0), 2.45 * scale, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      // Things on the water.
      L.items.forEach((it, i) => {
        const on = sel?.k === "item" && sel.i === i;
        drawItem(g, it, sx, sy, scale, t, on, c);
      });
      // River handles.
      if (toolRef.current === "river") {
        nodesOf(L).forEach((n, i) => {
          const on = sel?.k === "node" && sel.i === i;
          g.fillStyle = on ? "#fff" : "#ffe45e";
          g.beginPath();
          g.moveTo(sx(n.x), sy(n.z) - 8);
          g.lineTo(sx(n.x) + 8, sy(n.z));
          g.lineTo(sx(n.x), sy(n.z) + 8);
          g.lineTo(sx(n.x) - 8, sy(n.z));
          g.closePath();
          g.fill();
          g.fillStyle = "#ff9a2e";
          for (const sgn of [-1, 1]) {
            g.beginPath();
            g.arc(sx(n.x + sgn * n.hw), sy(n.z), 6, 0, Math.PI * 2);
            g.fill();
          }
        });
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [animate, sel]);

  // --- pointer ----------------------------------------------------------------------------

  const hitTest = (x: number, z: number): Selection => {
    const L = levelRef.current;
    const c = courseOf(L);
    const grab = (coarse.current ? 26 : 14) / view.current.scale;
    const t = animate ? performance.now() / 1000 : 0;
    for (let i = L.items.length - 1; i >= 0; i--) {
      const it = L.items[i];
      if (it.t === "gate" || it.t === "headwind") continue;
      let px = it.x;
      if (it.t === "log" || it.t === "gator") px = logAt({ x: it.x, z: it.z, half: it.half ?? 1, r: 1, amp: it.amp ?? 0, speed: it.speed ?? 1, phase: it.phase ?? 0 }, t).x;
      const reach = Math.max(grab, it.t === "lily" || it.t === "rock" || it.t === "bumper" || it.t === "boost" || it.t === "geyser" ? it.r ?? 1 : 1.4, it.t === "log" || it.t === "gator" ? (it.half ?? 1) : 0);
      if (Math.abs(z - it.z) < Math.max(grab, 1.2) && Math.abs(x - px) < reach) return { k: "item", i };
      if (Math.hypot(x - px, z - it.z) < reach) return { k: "item", i };
    }
    // Gates and headwinds span the river, so they only count when nothing smaller is under the finger.
    for (let i = L.items.length - 1; i >= 0; i--) {
      const it = L.items[i];
      if (it.t !== "gate" && it.t !== "headwind") continue;
      const zEnd = it.t === "headwind" ? it.z + (it.len ?? 12) : it.z;
      const mid = c.centerX((it.z + zEnd) / 2);
      if (z >= it.z - Math.max(grab, 1.2) && z <= zEnd + Math.max(grab, 1.2) && Math.abs(x - mid) < c.halfWidth(it.z) + 2) return { k: "item", i };
    }
    for (let i = 0; i < L.checkpoints.length; i++) if (Math.abs(z - L.checkpoints[i]) < grab && Math.abs(x - c.centerX(L.checkpoints[i])) < c.halfWidth(L.checkpoints[i]) + 2) return { k: "cp", i };
    if (Math.abs(z - L.finish) < grab && Math.abs(x - c.centerX(L.finish)) < c.halfWidth(L.finish) + 2) return { k: "finish" };
    if (c.vortex && Math.hypot(x - c.vortex.x, z - c.vortex.z) < c.vortex.r) return { k: "vortex" };
    for (let i = 0; i < L.sections.length; i++) if (L.sections[i][0] > 0 && Math.abs(z - L.sections[i][0]) < grab && x < c.centerX(L.sections[i][0]) - c.halfWidth(L.sections[i][0])) return { k: "label", i };
    return null;
  };

  const place = (type: ItemType, x: number, z: number) => {
    const spec = ITEM_TYPES[type];
    const item: Item = { t: type, x: round(x), z: round(z) };
    for (const [k, [, , dflt]] of Object.entries(spec)) (item as unknown as { [k: string]: number })[k] = dflt;
    if (type === "sweeper") {
      // Sweepers turn on a post in the bank: stick it to whichever bank was clicked.
      const side = x >= course.centerX(z) ? 1 : -1;
      item.x = round(course.centerX(z) + side * (course.halfWidth(z) - 0.4));
      item.speed = side > 0 ? 1.15 : -1.15;
    }
    if (type === "gate" || type === "headwind") item.x = round(course.centerX(z));
    change((l) => ({ ...l, items: [...l.items, item] }));
    setSel({ k: "item", i: levelRef.current.items.length - 1 });
  };

  const onDown = (e: React.PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.current.size === 2) {
      // A second finger: stop whatever the first was doing and start pinching.
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, scale: view.current.scale, mid: (a[1] + b[1]) / 2, z: view.current.z };
      drag.current = null;
      return;
    }
    if (pointers.current.size > 2) return;
    const [x, z] = toWorld(e.clientX, e.clientY);
    const t = toolRef.current;
    if (e.button === 1 || e.button === 2 || space.current) {
      drag.current = { kind: "pan", i: 0, moved: false, dz: e.clientY, dx: view.current.z };
      return;
    }
    if (t === "river") {
      const grab = (coarse.current ? 26 : 14) / view.current.scale;
      const ns = nodesOf(levelRef.current);
      for (let i = 0; i < ns.length; i++) {
        if (Math.hypot(x - ns[i].x, z - ns[i].z) < grab * 1.2) {
          setSel({ k: "node", i });
          drag.current = { kind: "node", i, moved: false };
          return;
        }
        for (const sgn of [-1, 1]) {
          if (Math.hypot(x - (ns[i].x + sgn * ns[i].hw), z - ns[i].z) < grab) {
            setSel({ k: "node", i });
            drag.current = { kind: "nodew", i, moved: false, dx: sgn };
            return;
          }
        }
      }
      if (z > -60 && z < levelRef.current.finish + 60 && Math.abs(x - course.centerX(z)) < course.halfWidth(z)) {
        const zz = round(z, 5);
        const node: Node = { z: zz, x: course.centerX(zz), hw: course.halfWidth(zz), flow: interpFlow(levelRef.current.flow, zz) };
        change((l) => withNodes(l, [...nodesOf(l), node]));
        const index = nodesOf(levelRef.current).findIndex((n) => n.z === zz);
        setSel({ k: "node", i: index });
        drag.current = { kind: "node", i: index, moved: false };
        return;
      }
      drag.current = { kind: "pan", i: 0, moved: false, dz: e.clientY, dx: view.current.z };
      return;
    }
    if (t === "select") {
      const hit = hitTest(x, z);
      setSel(hit);
      if (hit?.k === "item") {
        const it = levelRef.current.items[hit.i];
        drag.current = { kind: "item", i: hit.i, moved: false, dx: x - it.x, dz: z - it.z };
      } else if (hit?.k === "finish") drag.current = { kind: "finish", i: 0, moved: false };
      else if (hit?.k === "vortex") drag.current = { kind: "vortex", i: 0, moved: false };
      else if (hit?.k === "cp") drag.current = { kind: "cp", i: hit.i, moved: false };
      else drag.current = { kind: "pan", i: 0, moved: false, dz: e.clientY, dx: view.current.z };
      return;
    }
    // Placing, erasing and flags happen on release, so a pinch or a scroll doesn't drop things.
    drag.current = { kind: "tap", i: 0, moved: false, px: e.clientX, py: e.clientY, wx: x, wz: z, dz: e.clientY, dx: view.current.z };
  };

  const doTool = (t: Tool, x: number, z: number) => {
    if (t === "erase") {
      const hit = hitTest(x, z);
      if (hit) {
        selRef.current = hit;
        deleteSelected();
      }
      return;
    }
    if (t === "cp") {
      const zz = round(z, 5);
      const near = levelRef.current.checkpoints.findIndex((c) => Math.abs(c - zz) < 3);
      if (near >= 0) change((l) => ({ ...l, checkpoints: l.checkpoints.filter((_, i) => i !== near) }));
      else if (zz > 20 && zz < levelRef.current.finish - 15) change((l) => ({ ...l, checkpoints: [...l.checkpoints, zz].sort((a, b) => a - b) }));
      else setMsg("Flags go between the start and the finish.");
      return;
    }
    if (t === "label") {
      const zz = Math.max(0, round(z, 5));
      change((l) => ({ ...l, sections: [...l.sections, [zz, "New Stretch"] as [number, string]].sort((a, b) => a[0] - b[0]) }));
      setSel({ k: "label", i: levelRef.current.sections.findIndex((s) => s[0] === zz && s[1] === "New Stretch") });
      return;
    }
    place(t as ItemType, x, z);
  };

  const onMove = (e: React.PointerEvent) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const p = pinch.current;
      view.current.scale = Math.max(3, Math.min(24, (p.scale * Math.hypot(a[0] - b[0], a[1] - b[1])) / p.dist));
      view.current.z = p.z + ((a[1] + b[1]) / 2 - p.mid) / view.current.scale;
      return;
    }
    const [x, z] = toWorld(e.clientX, e.clientY);
    cursor.current = [x, z];
    const d = drag.current;
    if (!d) return;
    if (d.kind === "tap") {
      if (Math.hypot(e.clientX - (d.px ?? 0), e.clientY - (d.py ?? 0)) > 8) {
        d.kind = "pan";
        d.moved = true;
      }
      return;
    }
    d.moved = true;
    if (d.kind === "pan") {
      view.current.z = (d.dx ?? 0) + (e.clientY - (d.dz ?? 0)) / view.current.scale;
    } else if (d.kind === "item") {
      change((l) => ({ ...l, items: l.items.map((it, i) => (i === d.i ? { ...it, x: round(x - (d.dx ?? 0)), z: round(z - (d.dz ?? 0)) } : it)) }), false);
    } else if (d.kind === "node") {
      const ns = nodesOf(levelRef.current);
      const lo = ns[d.i - 1] ? ns[d.i - 1].z + 2 : -200;
      const hi = ns[d.i + 1] ? ns[d.i + 1].z - 2 : levelRef.current.finish + 200;
      ns[d.i] = { ...ns[d.i], x: Math.max(-60, Math.min(60, round(x, 0.5))), z: Math.max(lo, Math.min(hi, round(z, 5))) };
      change((l) => withNodes(l, ns), false);
    } else if (d.kind === "nodew") {
      const ns = nodesOf(levelRef.current);
      ns[d.i] = { ...ns[d.i], hw: Math.max(8, Math.min(20, round(Math.abs(x - ns[d.i].x), 0.5))) };
      change((l) => withNodes(l, ns), false);
    } else if (d.kind === "finish") {
      change((l) => ({ ...l, finish: Math.max(80, Math.min(1400, round(z, 5))) }), false);
    } else if (d.kind === "vortex") {
      change((l) => (l.vortex ? { ...l, vortex: { ...l.vortex, z: round(z, 5) } } : l), false);
    } else if (d.kind === "cp") {
      change((l) => ({ ...l, checkpoints: l.checkpoints.map((c, i) => (i === d.i ? Math.max(25, Math.min(l.finish - 20, round(z, 5))) : c)) }), false);
    }
  };

  const onUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "tap") {
      if (!d.moved && d.wx !== undefined && d.wz !== undefined) doTool(toolRef.current, d.wx, d.wz);
      return;
    }
    if (d.moved && d.kind !== "pan") commit();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey) view.current.scale = Math.max(3, Math.min(24, view.current.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    else view.current.z += (-e.deltaY * 0.4) / view.current.scale;
  };

  // --- panel ------------------------------------------------------------------------------

  const selItem = sel?.k === "item" ? level.items[sel.i] : null;
  const setItem = (patch: Partial<Item>, save = false) => {
    if (sel?.k !== "item") return;
    const i = sel.i;
    change((l) => ({ ...l, items: l.items.map((it, k) => (k === i ? { ...it, ...patch } : it)) }), save);
  };
  const finishEdit = () => commit();

  const check = () => {
    const def = sanitizeLevel(levelRef.current);
    if (!def) return;
    setMsg("Checking with bots…");
    window.setTimeout(() => {
      const lines: string[] = [];
      for (const seats of [4, 2]) {
        let best: { run: number; sinks: number } | null = null;
        let stuck = 0;
        for (let seed = 1; seed <= 3; seed++) {
          const sim = createSim({ seats, skill: 1, seed, level: def });
          let steps = 0;
          while (sim.phase !== "done" && steps++ < 60 * 360) sim.step(STEP);
          if (sim.phase === "done" && (!best || sim.run < best.run)) best = { run: sim.run, sinks: sim.sinks };
          else if (sim.phase !== "done") stuck = Math.max(stuck, Math.round(sim.z));
        }
        lines.push(best ? `${seats} hippos: bots finish in ${fmtTime(best.run)} (${best.sinks} sinks)` : `${seats} hippos: bots got stuck around ${stuck} m. Make a gap wider?`);
      }
      setMsg(lines.join("  ·  "));
    }, 30);
  };

  const save = () => {
    const def = sanitizeLevel(levelRef.current);
    if (!def) return;
    onSave({ id, def });
    setDirty(false);
    setMsg(`Saved "${def.name}".`);
  };

  const share = () => {
    const def = sanitizeLevel(levelRef.current);
    if (def) setCode({ text: encodeLevel(def), mode: "share" });
  };

  const importCode = () => {
    const def = decodeLevel(code?.text ?? "");
    if (!def) {
      setMsg("That doesn't look like a level code.");
      return;
    }
    change(() => def);
    setCode(null);
    setSel(null);
    setMsg(`Loaded "${def.name}".`);
  };

  const exit = () => {
    if (dirty && !window.confirm("Leave without saving?")) return;
    onExit();
  };

  const hint = TOOLS.find((t) => t.id === tool)?.hint ?? "";
  const btn = "rounded-lg border-2 border-[#1b1030] px-2 py-1 text-xs font-extrabold [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2";

  return (
    <div className="absolute inset-0 z-30 flex flex-col bg-[#16213a] text-white">
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[#1b1030] bg-[#241a42] p-2">
        <button type="button" className={`${btn} bg-[#8b86a8]`} onClick={exit}>
          ← EXIT
        </button>
        <input
          className="w-40 rounded-lg border-2 border-[#1b1030] bg-[#fff7e0] px-2 py-1 text-sm font-extrabold text-[#1b1030]"
          value={level.name}
          maxLength={24}
          onChange={(e) => change((l) => ({ ...l, name: e.target.value }), false)}
          onBlur={finishEdit}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button type="button" className={`${btn} bg-[#4aa9f0]`} onClick={undo} disabled={history.at === 0}>
          ↶
        </button>
        <button type="button" className={`${btn} bg-[#4aa9f0]`} onClick={redo} disabled={history.at >= history.stack.length - 1}>
          ↷
        </button>
        <button type="button" className={`${btn} bg-[#5fcf5a]`} onClick={() => onTest({ id, def: sanitizeLevel(levelRef.current) ?? levelRef.current })}>
          ▶ TEST
        </button>
        <button type="button" className={`${btn} bg-[#ff9a2e]`} onClick={check}>
          ✔ CHECK
        </button>
        <button type="button" className={`${btn} bg-[#5fcf5a]`} onClick={save}>
          💾 SAVE{dirty ? "*" : ""}
        </button>
        <button type="button" className={`${btn} bg-[#e86aa6]`} onClick={share}>
          SHARE
        </button>
        <button type="button" className={`${btn} bg-[#e86aa6]`} onClick={() => setCode({ text: "", mode: "import" })}>
          IMPORT
        </button>
        <label className="ml-auto flex items-center gap-1 text-xs">
          <input type="checkbox" checked={animate} onChange={(e) => setAnimate(e.target.checked)} /> Animate
        </label>
      </div>
      <div className="flex gap-1 overflow-x-auto border-b-2 border-[#1b1030] bg-[#1d2a4a] p-1">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            title={t.hint}
            className={`${btn} flex shrink-0 flex-col items-center px-2 ${tool === t.id ? "bg-[#ffe45e] text-[#1b1030]" : "bg-[#3b4a78]"}`}
            onClick={() => {
              setTool(t.id);
              setMsg(t.hint);
              if (t.id !== "select" && t.id !== "river") setSel(null);
            }}
          >
            <span className="text-base leading-none">{t.icon}</span>
            <span className="text-[10px]">{t.label}</span>
          </button>
        ))}
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div ref={wrap} className="relative min-h-0 min-w-0 flex-1" onContextMenu={(e) => e.preventDefault()}>
          <canvas ref={canvas} className="absolute inset-0 h-full w-full touch-none" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onWheel={onWheel} style={{ cursor: tool === "select" ? "default" : "crosshair" }} />
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-lg bg-[#1b1030]/80 px-2 py-1 text-xs">{msg || hint}</div>
          <div className="absolute right-2 top-2 flex flex-col gap-1">
            <button type="button" className={`${btn} bg-[#3b4a78]`} onClick={() => (view.current.scale = Math.min(24, view.current.scale * 1.25))}>
              ＋
            </button>
            <button type="button" className={`${btn} bg-[#3b4a78]`} onClick={() => (view.current.scale = Math.max(3, view.current.scale * 0.8))}>
              －
            </button>
            <button type="button" className={`${btn} bg-[#3b4a78]`} onClick={() => (view.current.z += 60 / view.current.scale)}>
              ▲
            </button>
            <button type="button" className={`${btn} bg-[#3b4a78]`} onClick={() => (view.current.z -= 60 / view.current.scale)}>
              ▼
            </button>
          </div>
        </div>
        <div className="max-h-[36%] w-full shrink-0 overflow-y-auto border-t-2 border-[#1b1030] bg-[#241a42] p-3 text-sm md:max-h-none md:w-60 md:border-l-2 md:border-t-0" style={{ touchAction: "pan-y" }}>
          {selItem ? (
            <div className="flex flex-col gap-2">
              <div className="text-base font-extrabold capitalize text-[#ffe45e]">{TOOLS.find((t) => t.id === selItem.t)?.label}</div>
              <Field label="Across (x)">
                <Slider value={selItem.x} lo={-40} hi={40} step={0.5} onChange={(v) => setItem({ x: v })} onCommit={finishEdit} />
              </Field>
              <Field label="Down (z)">
                <Slider value={selItem.z} lo={5} hi={level.finish + 10} step={0.5} onChange={(v) => setItem({ z: v })} onCommit={finishEdit} />
              </Field>
              {Object.entries(ITEM_TYPES[selItem.t]).map(([k, [lo, hi]]) => (
                <Field key={k} label={FIELD_LABELS[k] ?? k}>
                  <Slider value={(selItem as unknown as { [k: string]: number })[k] ?? lo} lo={lo} hi={hi} step={k === "bars" || k === "hazard" ? 1 : 0.05} onChange={(v) => setItem({ [k]: v })} onCommit={finishEdit} />
                </Field>
              ))}
              <button type="button" className={`${btn} bg-[#e0583a]`} onClick={deleteSelected}>
                DELETE
              </button>
            </div>
          ) : sel?.k === "node" && nodes[sel.i] ? (
            <div className="flex flex-col gap-2">
              <div className="text-base font-extrabold text-[#ffe45e]">River point</div>
              <Field label="Half width">
                <Slider value={nodes[sel.i].hw} lo={8} hi={20} step={0.5} onChange={(v) => change((l) => withNodes(l, nodesOf(l).map((n, i) => (i === sel.i ? { ...n, hw: v } : n))), false)} onCommit={finishEdit} />
              </Field>
              <Field label="Current">
                <Slider value={nodes[sel.i].flow} lo={0} hi={6} step={0.1} onChange={(v) => change((l) => withNodes(l, nodesOf(l).map((n, i) => (i === sel.i ? { ...n, flow: v } : n))), false)} onCommit={finishEdit} />
              </Field>
              <div className="text-xs opacity-70">At {nodes[sel.i].z} m. Raft is about 5 m across: keep 6 m+ gaps.</div>
              <button type="button" className={`${btn} bg-[#e0583a]`} onClick={deleteSelected}>
                DELETE POINT
              </button>
            </div>
          ) : sel?.k === "label" ? (
            <div className="flex flex-col gap-2">
              <div className="text-base font-extrabold text-[#ffe45e]">Stretch name</div>
              <input
                className="rounded-lg border-2 border-[#1b1030] bg-[#fff7e0] px-2 py-1 text-sm font-extrabold text-[#1b1030]"
                value={level.sections[sel.i]?.[1] ?? ""}
                maxLength={24}
                onChange={(e) => change((l) => ({ ...l, sections: l.sections.map((s, i) => (i === sel.i ? ([s[0], e.target.value] as [number, string]) : s)) }), false)}
                onBlur={finishEdit}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <button type="button" className={`${btn} bg-[#e0583a]`} onClick={deleteSelected}>
                DELETE
              </button>
            </div>
          ) : sel?.k === "vortex" && level.vortex ? (
            <div className="flex flex-col gap-2">
              <div className="text-base font-extrabold text-[#ffe45e]">Whirlpool</div>
              <Field label="Size">
                <Slider value={level.vortex.r} lo={6} hi={24} step={0.5} onChange={(v) => change((l) => (l.vortex ? { ...l, vortex: { ...l.vortex, r: v } } : l), false)} onCommit={finishEdit} />
              </Field>
              <Field label="Strength">
                <Slider value={level.vortex.strength} lo={0.5} hi={4} step={0.1} onChange={(v) => change((l) => (l.vortex ? { ...l, vortex: { ...l.vortex, strength: v } } : l), false)} onCommit={finishEdit} />
              </Field>
              <button type="button" className={`${btn} bg-[#e0583a]`} onClick={deleteSelected}>
                REMOVE
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-base font-extrabold text-[#ffe45e]">This river</div>
              <Field label="Length (m)">
                <Slider value={level.finish} lo={80} hi={900} step={5} onChange={(v) => change((l) => ({ ...l, finish: v, checkpoints: l.checkpoints.filter((c) => c < v - 15) }), false)} onCommit={finishEdit} />
              </Field>
              <Field label="Whirlpool">
                <input type="checkbox" checked={!!level.vortex} onChange={(e) => change((l) => ({ ...l, vortex: e.target.checked ? { z: round(l.finish * 0.7, 5), r: 16, strength: 2.4 } : null }))} />
              </Field>
              <div className="text-xs leading-snug opacity-80">
                <p>{level.items.length} things · {level.checkpoints.length} flags · {course.rings.length} rings</p>
                <p className="mt-2">Rings take a second off your time each. Put them where a skilled raft would fly.</p>
                <p className="mt-2">On a phone: drag to scroll, pinch to zoom. On a computer: scroll wheel, Ctrl+scroll to zoom, Delete removes, Ctrl+Z undoes.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {code && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-lg flex-col gap-2 rounded-2xl border-4 border-[#1b1030] bg-[#241a42] p-4">
            <div className="text-lg font-extrabold text-[#ffe45e]">{code.mode === "share" ? "Share this level" : "Import a level"}</div>
            <p className="text-xs opacity-80">{code.mode === "share" ? "Send this code to a friend. They paste it into IMPORT in their editor, or on the level screen." : "Paste a level code here."}</p>
            <textarea
              className="h-40 rounded-lg border-2 border-[#1b1030] bg-[#fff7e0] p-2 font-mono text-xs text-[#1b1030]"
              value={code.text}
              readOnly={code.mode === "share"}
              onChange={(e) => setCode({ ...code, text: e.target.value })}
              onFocus={(e) => code.mode === "share" && e.currentTarget.select()}
              onKeyDown={(e) => e.stopPropagation()}
            />
            <div className="flex justify-end gap-2">
              {code.mode === "share" && (
                <button type="button" className={`${btn} bg-[#4aa9f0]`} onClick={() => void navigator.clipboard?.writeText(code.text).then(() => setMsg("Copied the code."))}>
                  COPY
                </button>
              )}
              {code.mode === "import" && (
                <button type="button" className={`${btn} bg-[#5fcf5a]`} onClick={importCode}>
                  LOAD IT
                </button>
              )}
              <button type="button" className={`${btn} bg-[#8b86a8]`} onClick={() => setCode(null)}>
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// One thing on the map.
function drawItem(g: CanvasRenderingContext2D, it: Item, sx: (x: number) => number, sy: (z: number) => number, scale: number, t: number, on: boolean, c: CourseT) {
  const x = sx(it.x);
  const y = sy(it.z);
  const ring = (r: number, fill: string, stroke = "#1b1030") => {
    g.beginPath();
    g.arc(x, y, Math.max(3, r * scale), 0, Math.PI * 2);
    g.fillStyle = fill;
    g.fill();
    g.lineWidth = on ? 4 : 2;
    g.strokeStyle = on ? "#fff" : stroke;
    g.stroke();
  };
  switch (it.t) {
    case "gate": {
      const cx = c.centerX(it.z);
      const hw = c.halfWidth(it.z);
      g.strokeStyle = on ? "#fff" : "#8f8aa8";
      g.lineWidth = 9;
      g.beginPath();
      g.moveTo(sx(cx - hw - 2), y);
      g.lineTo(sx(cx + hw + 2), y);
      g.stroke();
      g.strokeStyle = "#3d3858";
      g.lineWidth = 3;
      g.setLineDash([3, 6]);
      g.beginPath();
      g.moveTo(sx(cx - hw), y);
      g.lineTo(sx(cx + hw), y);
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#fff";
      g.font = "bold 11px sans-serif";
      g.textAlign = "center";
      g.fillText(`LOCK ×${it.need ?? 2} ${it.mode === 1 ? `taps ${it.count ?? 3}` : `hold ${it.hold ?? 1.4}s`}`, sx(cx), y - 8);
      g.textAlign = "left";
      break;
    }
    case "headwind": {
      const cx = c.centerX(it.z + (it.len ?? 12) / 2);
      const hw = c.halfWidth(it.z + (it.len ?? 12) / 2);
      const y2 = sy(it.z + (it.len ?? 12));
      g.fillStyle = "rgba(210,240,255,0.35)";
      g.fillRect(sx(cx - hw), y2, hw * 2 * scale, y - y2);
      g.strokeStyle = on ? "#fff" : "rgba(255,255,255,0.8)";
      g.lineWidth = on ? 3 : 2;
      g.strokeRect(sx(cx - hw), y2, hw * 2 * scale, y - y2);
      g.fillStyle = "#fff";
      g.font = "bold 11px sans-serif";
      g.textAlign = "center";
      g.fillText(`HEADWIND ×${it.need ?? 2}`, sx(cx), (y + y2) / 2 + 4);
      g.textAlign = "left";
      break;
    }
    case "rock":
      ring(it.r ?? 1.5, "#9b94ad");
      break;
    case "mine":
      ring(it.r ?? 0.85, "#7a2fd0");
      g.fillStyle = "#f4ecd2";
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.fillRect(x + Math.cos(a) * (it.r ?? 0.85) * scale - 1, y + Math.sin(a) * (it.r ?? 0.85) * scale - 1, 3, 3);
      }
      break;
    case "bumper":
      ring(it.r ?? 1.3, "#ff8a1f");
      break;
    case "boost":
      ring(it.r ?? 2.6, "rgba(255,226,90,0.7)", "#a35a00");
      g.fillStyle = "#a35a00";
      g.font = "bold 14px sans-serif";
      g.textAlign = "center";
      g.fillText("»", x, y + 5);
      g.textAlign = "left";
      break;
    case "lily":
      ring(it.r ?? 4, "rgba(76,176,74,0.75)", "#2c6b2a");
      break;
    case "ring":
      g.beginPath();
      g.ellipse(x, y, 1.8 * scale, 0.5 * scale, 0, 0, Math.PI * 2);
      g.lineWidth = on ? 5 : 3;
      g.strokeStyle = on ? "#fff" : "#ffd23a";
      g.stroke();
      break;
    case "geyser": {
      const r = it.r ?? 3.4;
      ring(r * 0.55, "rgba(255,255,255,0.8)", "#8fd0ff");
      g.setLineDash([3, 3]);
      g.strokeStyle = "rgba(255,255,255,0.6)";
      g.beginPath();
      g.arc(x, y, r * scale, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
      break;
    }
    case "sweeper": {
      const [ax, az, bx, bz] = sweeperEnds({ x: it.x, z: it.z, len: it.len ?? 8, speed: it.speed ?? 1, phase: it.phase ?? 0 }, t);
      g.strokeStyle = on ? "#fff" : "#8a5a38";
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(sx(ax), sy(az));
      g.lineTo(sx(bx), sy(bz));
      g.stroke();
      g.strokeStyle = "rgba(255,255,255,0.25)";
      g.lineWidth = 1;
      g.beginPath();
      g.arc(x, y, (it.len ?? 8) * scale, 0, Math.PI * 2);
      g.stroke();
      ring(0.7, "#5a3a26");
      break;
    }
    case "spinner": {
      const bars = spinnerBars({ x: it.x, z: it.z, len: it.len ?? 4.6, speed: it.speed ?? 1, phase: it.phase ?? 0, bars: it.bars ?? 2 }, t);
      g.strokeStyle = on ? "#fff" : it.hazard ? "#d64a3a" : "#ffb02e";
      g.lineWidth = 5;
      for (const b of bars) {
        g.beginPath();
        g.moveTo(sx(b.ends[0]), sy(b.ends[1]));
        g.lineTo(sx(b.ends[2]), sy(b.ends[3]));
        g.stroke();
      }
      ring(0.8, it.hazard ? "#5a3a26" : "#e07a3c");
      break;
    }
    case "log":
    case "gator": {
      const { x: cxl } = logAt({ x: it.x, z: it.z, half: it.half ?? 1, r: 1, amp: it.amp ?? 0, speed: it.speed ?? 1, phase: it.phase ?? 0 }, t);
      g.strokeStyle = "rgba(255,255,255,0.35)";
      g.setLineDash([4, 4]);
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(sx(it.x - (it.amp ?? 0)), y);
      g.lineTo(sx(it.x + (it.amp ?? 0)), y);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = on ? "#fff" : it.t === "log" ? "#a06b3c" : "#3f8f3a";
      g.lineWidth = it.t === "log" ? 8 : 9;
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(sx(cxl - (it.half ?? 1)), y);
      g.lineTo(sx(cxl + (it.half ?? 1)), y);
      g.stroke();
      g.lineCap = "butt";
      break;
    }
  }
}
