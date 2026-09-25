// Frog Ball's stages. Each is a list of solid parts (boxes and upright
// cylinders, some moving), flies to collect, and a goal gate. Forward is -z,
// and y is the top of whatever floor a point sits on.

export type Vec = [number, number, number];

// How a part is drawn; each world has colours for these.
export type Tone = "floor" | "alt" | "wall" | "bumper" | "spring" | "cap" | "moving" | "goal" | "pillar";

interface Motion {
  // Oscillates between base - by and base + by.
  move?: { by: Vec; period: number; phase?: number };
  // Keeps turning, in degrees per second, about axis (default up) through pivot.
  spin?: { speed: number; axis?: Vec; pivot?: Vec; phase?: number };
  // Rocks back and forth by amp degrees about axis (default the part's length, z).
  swing?: { amp: number; period: number; axis?: Vec; pivot?: Vec; phase?: number };
}

interface PartCommon extends Motion {
  at: Vec; // centre
  rot?: Vec; // [pitch, yaw, roll] degrees
  tone?: Tone;
  bumper?: boolean;
  // Sets your bounce speed when you land on it.
  spring?: number;
}

export type PartDef = (PartCommon & { shape: "box"; size: Vec }) | (PartCommon & { shape: "cyl"; r: number; h: number });

export interface StageDef {
  id: string;
  name: string;
  world: number;
  time: number;
  start: Vec;
  heading: number; // degrees; 0 faces -z
  goal: { at: Vec; heading: number; width?: number };
  parts: PartDef[];
  flies: { at: Vec; big?: boolean }[];
  pads?: { at: Vec; heading: number; size?: [number, number] }[];
  // Waypoints for the autopilot. It only heads for one with a window while
  // (stage clock mod period) is between from and to, holding at the last one.
  route: Waypoint[];
}

export type Waypoint = [x: number, y: number, z: number, speed?: number, reach?: number, window?: [period: number, from: number, to: number]];

export interface WorldDef {
  name: string;
  blurb: string;
}

export const WORLDS: WorldDef[] = [
  { name: "Lily Dawn", blurb: "A pink sunrise over a sleepy pond" },
  { name: "Candy Carnival", blurb: "Gumdrops, lollipops and a runaway carousel" },
  { name: "Bubble Lagoon", blurb: "A dream at the bottom of the sea" },
  { name: "Moonshroom Grove", blurb: "Glowing mushrooms under a giant moon" },
  { name: "Starlight Nebula", blurb: "The very edge of the dream" },
];

// --- builders ------------------------------------------------------------------

const T = 1; // floor thickness
type Opts = Partial<PartCommon> & { thick?: number };

const deg = (r: number) => (r * 180) / Math.PI;

// A flat floor whose top is at y, w wide (x) and d deep (z).
function floor(x: number, y: number, z: number, w: number, d: number, o: Opts = {}): PartDef {
  const t = o.thick ?? T;
  return { shape: "box", at: [x, y - t / 2, z], size: [w, t, d], tone: "floor", ...o };
}

// A floor spanning z0 (near) to z1 (far).
function floorZ(x: number, y: number, z0: number, z1: number, w: number, o: Opts = {}): PartDef {
  return floor(x, y, (z0 + z1) / 2, w, Math.abs(z0 - z1), o);
}

// A slab whose top surface runs along the line a -> b.
function ramp(a: Vec, b: Vec, w: number, o: Opts = {}): PartDef {
  const t = o.thick ?? T;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const horiz = Math.hypot(dx, dz);
  const length = Math.hypot(horiz, dy);
  // Heading of travel a -> b, in the same convention as StageDef.heading.
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, horiz);
  // The slab's up direction, to sink its centre half a thickness below the line.
  const up: Vec = [Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw)];
  const mid: Vec = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  return {
    shape: "box",
    at: [mid[0] - (up[0] * t) / 2, mid[1] - (up[1] * t) / 2, mid[2] - (up[2] * t) / 2],
    size: [w, t, length],
    rot: [deg(pitch), deg(yaw), 0],
    tone: "floor",
    ...o,
  };
}

// A round platform with its top at y.
function disc(x: number, y: number, z: number, r: number, o: Opts = {}): PartDef {
  const t = o.thick ?? T;
  return { shape: "cyl", at: [x, y - t / 2, z], r, h: t, tone: "alt", ...o };
}

// Ramps between each pair of points, with round joints so turns have no gaps.
function road(pts: Vec[], w: number, o: Opts = {}): PartDef[] {
  const parts: PartDef[] = [];
  for (let i = 0; i + 1 < pts.length; i++) parts.push(ramp(pts[i], pts[i + 1], w, o));
  for (let i = 1; i + 1 < pts.length; i++) parts.push(disc(pts[i][0], pts[i][1], pts[i][2], w / 2, { tone: o.tone ?? "floor" }));
  return parts;
}

// Low walls down both sides of a ramp a -> b.
function rails(a: Vec, b: Vec, w: number, h = 0.6): PartDef[] {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const l = Math.hypot(dx, dz);
  const rx = (-dz / l) * (w / 2 - 0.15);
  const rz = (dx / l) * (w / 2 - 0.15);
  return [1, -1].map((s) =>
    ramp([a[0] + rx * s, a[1] + h, a[2] + rz * s], [b[0] + rx * s, b[1] + h, b[2] + rz * s], 0.3, { thick: h, tone: "wall" })
  );
}

function bumper(x: number, y: number, z: number, r = 0.8, h = 1.2, o: Opts = {}): PartDef {
  return { shape: "cyl", at: [x, y + h / 2 - 0.2, z], r, h, tone: "bumper", bumper: true, ...o };
}

// n flies from a to b, hovering over the floor at those points.
function flyLine(a: Vec, b: Vec, n: number): StageDef["flies"] {
  const out: StageDef["flies"] = [];
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0.5 : i / (n - 1);
    out.push({ at: [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + 0.55, a[2] + (b[2] - a[2]) * k] });
  }
  return out;
}

function flyRing(x: number, y: number, z: number, r: number, n: number, a0 = 0): StageDef["flies"] {
  return Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return { at: [x + Math.sin(a) * r, y + 0.55, z + Math.cos(a) * r] as Vec };
  });
}

const big = (x: number, y: number, z: number) => ({ at: [x, y + 0.7, z] as Vec, big: true });

// A U-shaped halfpipe of slabs around an axis from a to b (the axis is r above
// the pipe's bottom), open at the top between -arc and +arc degrees.
function halfpipe(a: Vec, b: Vec, r: number, arc = 80, slabs = 9, o: Opts = {}): PartDef[] {
  const t = o.thick ?? 0.6;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const horiz = Math.hypot(dx, dz);
  const length = Math.hypot(horiz, dy);
  const yaw = Math.atan2(-dx, -dz);
  const pitch = Math.atan2(dy, horiz);
  // The axis sits r above the bottom line, square to the slope.
  const up: Vec = [Math.sin(pitch) * Math.sin(yaw), Math.cos(pitch), Math.sin(pitch) * Math.cos(yaw)];
  const mid: Vec = [(a[0] + b[0]) / 2 + up[0] * r, (a[1] + b[1]) / 2 + up[1] * r, (a[2] + b[2]) / 2 + up[2] * r];
  const parts: PartDef[] = [];
  const stepA = (2 * arc) / (slabs - 1);
  const chord = 2 * (r + t / 2) * Math.sin(((stepA / 2) * Math.PI) / 180) * 1.06;
  for (let i = 0; i < slabs; i++) {
    const th = ((-arc + i * stepA) * Math.PI) / 180;
    // Slab centre in the pipe's own frame (x across, y up, z along), before pitch/yaw.
    const lx = Math.sin(th) * (r + t / 2);
    const ly = -Math.cos(th) * (r + t / 2);
    // Pitch about x, then yaw about y.
    const py = ly * Math.cos(pitch);
    const pz = ly * Math.sin(pitch);
    // three.js forward is -z: travel direction a->b maps local -z to the heading.
    const wx = lx * Math.cos(yaw) + pz * Math.sin(yaw);
    const wz = -lx * Math.sin(yaw) + pz * Math.cos(yaw);
    parts.push({
      shape: "box",
      at: [mid[0] + wx, mid[1] + py, mid[2] + wz],
      size: [chord, t, length],
      rot: [deg(pitch), deg(yaw), deg(th)],
      tone: i % 2 ? "alt" : "floor",
      ...o,
    });
  }
  return parts;
}

// --- the stages ------------------------------------------------------------------

const S: StageDef[] = [];

// 1-1: wide and gentle, to learn the tilt.
S.push({
  id: "1-1",
  name: "Hop Along",
  world: 0,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, -4, -48], heading: 0 },
  parts: [floorZ(0, 0, 3, -22, 8), ramp([0, 0, -22], [0, -4, -40], 8, { tone: "alt" }), floorZ(0, -4, -40, -54, 8)],
  flies: [...flyLine([0, 0, -5], [0, 0, -17], 4), ...flyLine([2.5, -0.5, -24.5], [2.5, -3.5, -37.5], 4), big(-2.5, -4, -44)],
  route: [
    [0, 0, -20],
    [0, -4, -48, 8],
  ],
});

// 1-2: lily pads joined by thin stems.
S.push({
  id: "1-2",
  name: "Lily Steps",
  world: 0,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, -2, -44], heading: 0 },
  parts: [
    disc(0, 0, 0, 3.5),
    ramp([0, 0, -2.5], [0, 0, -9.5], 2),
    disc(0, 0, -12, 3.5),
    ramp([2, 0, -14], [7.5, -1, -19.5], 2),
    disc(9, -1, -21, 3.5),
    ramp([9, -1, -23.5], [9, -1, -31.5], 1.8),
    disc(9, -1, -34, 3.5),
    ramp([7, -1, -36], [1.5, -2, -41.5], 1.8),
    disc(0, -2, -43.5, 4),
  ],
  flies: [
    ...flyLine([0, 0, -4], [0, 0, -9], 3),
    ...flyRing(0, 0, -12, 2.2, 5),
    ...flyLine([3, 0, -15], [6.5, -1, -18.5], 2),
    ...flyLine([9, -1, -25], [9, -1, -30], 3),
    big(11, -1, -34),
    ...flyLine([6, -1, -37], [2.5, -2, -40.5], 2),
  ],
  route: [
    [0, 0, -12, 6],
    [1.8, 0, -13.8, 5],
    [7.5, -1, -19.5, 5],
    [9, -1, -22, 5],
    [9, -1, -34, 6],
    [7, -1, -36, 5],
    [1.5, -2, -41.5, 5],
    [0, -2, -44, 5],
  ],
});

// 1-3: a zig-zag down the hill with no walls at the corners.
{
  const pts: Vec[] = [
    [0, 0, -1],
    [0, 0, -10],
    [-8, -2, -16],
    [-8, -2, -26],
    [4, -4, -32],
    [4, -4, -42],
    [0, -5, -47],
  ];
  S.push({
    id: "1-3",
    name: "Pond Switchback",
    world: 0,
    time: 60,
    start: [0, 0, 1],
    heading: 0,
    goal: { at: [0, -5, -52], heading: 0 },
    parts: [floorZ(0, 0, 3.5, -1, 5, { tone: "alt" }), ...road(pts, 3), floorZ(0, -5, -46, -56, 8, { tone: "alt" })],
    flies: [
      ...flyLine([0, 0, -2], [0, 0, -8], 3),
      ...flyLine([-2, -0.5, -11.5], [-6, -1.5, -14.5], 2),
      ...flyLine([-8, -2, -18], [-8, -2, -24], 3),
      big(-8, -2, -16),
      ...flyLine([-5, -2.5, -27.5], [1, -3.5, -30.5], 3),
      ...flyLine([4, -4, -34], [4, -4, -40], 3),
    ],
    route: [
      [0, 0, -10, 6, 1.2],
      [-8, -2, -16, 6, 1.2],
      [-8, -2, -26, 6, 1.2],
      [4, -4, -32, 6, 1.2],
      [4, -4, -42, 6, 1.2],
      [0, -5, -47, 6],
      [0, -5, -52, 6],
    ],
  });
}

// 2-1: a candy field full of bumpers.
S.push({
  id: "2-1",
  name: "Gumdrop Garden",
  world: 1,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, 0, -25], heading: 0 },
  parts: [
    floorZ(0, 0, 3, -28, 18),
    ...rails([0, 0, 3], [0, 0, -28], 18),
    ...(
      [
        [-4, -6],
        [0, -8],
        [4, -6],
        [-6, -13],
        [-2, -14],
        [2, -14],
        [6, -13],
        [-4, -19],
        [0, -20.5],
        [4, -19],
      ] as [number, number][]
    ).map(([x, z]) => bumper(x, 0, z)),
  ],
  flies: [
    ...flyRing(0, 0, -8, 1.6, 4, Math.PI / 4),
    ...flyRing(-2, 0, -14, 1.6, 3),
    ...flyRing(2, 0, -14, 1.6, 3),
    big(0, 0, -17),
    ...flyLine([7.5, 0, -4], [7.5, 0, -22], 4),
    ...flyLine([-7.5, 0, -4], [-7.5, 0, -22], 4),
  ],
  route: [
    [7.8, 0, -4, 7],
    [7.8, 0, -22.5, 6],
    [0, 0, -22.5, 5],
    [0, 0, -27, 5],
  ],
});

// 2-2: a spinning carousel with bumpers riding it.
{
  const c: Vec = [0, 0, -17];
  const ring = [0, 120, 240].map((a) => {
    const r = 5.6;
    const x = Math.sin((a * Math.PI) / 180) * r;
    const z = c[2] + Math.cos((a * Math.PI) / 180) * r;
    return bumper(x, 0, z, 0.75, 1.2, { spin: { speed: 28, pivot: c } });
  });
  S.push({
    id: "2-2",
    name: "Carousel",
    world: 1,
    time: 60,
    start: [0, 0, 0],
    heading: 0,
    goal: { at: [0, 0, -36], heading: 0 },
    parts: [
      floorZ(0, 0, 3, -3, 5),
      floorZ(0, 0, -3, -8.45, 3),
      disc(c[0], 0, c[2], 8.5, { tone: "moving", spin: { speed: 28 } }),
      bumper(c[0], 0, c[2], 1.2, 1.2, { spin: { speed: 28 } }),
      ...ring,
      floorZ(0, 0, -25.55, -31, 3),
      floorZ(0, 0, -31, -40, 6, { tone: "alt" }),
    ],
    flies: [...flyRing(c[0], 0, c[2], 4, 8), ...flyLine([0, 0, -4], [0, 0, -7.5], 2), big(-6.5, 0, -17), ...flyLine([0, 0, -26.5], [0, 0, -30], 2)],
    route: [
      [0, 0, -8.8, 4],
      [-2.7, 0, -14.5, 4],
      [-2.7, 0, -19.5, 4],
      [0, 0, -25.8, 5],
      [0, 0, -37, 6],
    ],
  });
}

// 2-3: a candy-stripe slide into a ski jump.
S.push({
  id: "2-3",
  name: "Sugar Rush",
  world: 1,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, -12, -60], heading: 0 },
  parts: [
    floorZ(0, 0, 3, -8, 6, { tone: "alt" }),
    ramp([0, 0, -8], [0, -10, -30], 5),
    ...rails([0, 0, -8], [0, -10, -30], 5),
    ramp([0, -10, -30], [0, -8.5, -36], 5, { tone: "alt" }),
    floorZ(0, -12, -41, -65, 11),
  ],
  pads: [{ at: [0, 0, -4], heading: 0 }],
  flies: [
    ...flyLine([-1.5, -2, -12.5], [-1.5, -8, -25.5], 4),
    ...flyLine([1.5, -2, -12.5], [1.5, -8, -25.5], 4),
    { at: [0, -7.2, -40] },
    { at: [0, -7.8, -44] },
    { at: [0, -9, -48] },
    big(4, -12, -56),
  ],
  route: [
    [0, 0, -8, 30],
    [0, -10, -30, 30],
    [0, -8.5, -36, 30],
    [0, -12, -61, 8],
  ],
});

// 3-1: sliding jelly platforms, then a lift up to the goal.
S.push({
  id: "3-1",
  name: "Jelly Lifts",
  world: 2,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, 3, -35], heading: 0 },
  parts: [
    floorZ(0, 0, 3, -4.7, 4, { tone: "alt" }),
    floorZ(0, 0, -4.9, -9.3, 5.6, { tone: "moving", move: { by: [2, 0, 0], period: 4.5 } }),
    floorZ(0, 0, -9.7, -14.3, 5.6, { tone: "moving", move: { by: [2, 0, 0], period: 4.5, phase: 0.5 } }),
    floorZ(0, 0, -14.7, -19.1, 5.6, { tone: "moving", move: { by: [2, 0, 0], period: 4.5, phase: 0.25 } }),
    floorZ(0, 0, -19.3, -26, 6, { tone: "alt" }),
    floor(0, 1.5, -28.3, 4, 4, { tone: "moving", move: { by: [0, 1.5, 0], period: 5 } }),
    floorZ(0, 3, -30.4, -39, 7, { thick: 3.5 }),
  ],
  flies: [
    ...flyLine([0, 0, -1], [0, 0, -4], 2),
    { at: [3, 0.55, -7] },
    { at: [-3, 0.55, -12] },
    { at: [3, 0.55, -17] },
    ...flyLine([-2, 0, -21], [2, 0, -24], 3),
    big(0, 3.2, -28.3),
    ...flyLine([-2.5, 3, -33], [2.5, 3, -33], 3),
  ],
  route: [
    [0, 0, -4, 4],
    [0, 0, -7, 3.5],
    [0, 0, -12, 3.5],
    [0, 0, -17, 3.5],
    [0, 0, -22, 3],
    [0, 0, -25, 2],
    [0, 3, -28.3, 2.5, 1.1, [5, 2.2, 2.7]],
    [0, 3, -35, 5],
  ],
});

// 3-2: a narrow bridge swept by drifting blocks.
S.push({
  id: "3-2",
  name: "Current Crossing",
  world: 2,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, 0, -37], heading: 0 },
  parts: [
    floorZ(0, 0, 3, -3, 6, { tone: "alt" }),
    floorZ(0, 0, -3, -33, 2.6),
    ...[-9, -15, -21, -27].map(
      (z, i): PartDef => ({ shape: "box", at: [0, 0.5, z], size: [1.4, 1, 1.6], tone: "bumper", move: { by: [3.4, 0, 0], period: 3.2 + i * 0.4, phase: i * 0.3 } })
    ),
    floorZ(0, 0, -33, -42, 7, { tone: "alt" }),
  ],
  flies: [...flyLine([0, 0, -5], [0, 0, -31], 12), big(2.5, 0, -40)],
  route: [
    [0, 0, -3, 4],
    [0, 0, -33, 4.5],
    [0, 0, -37, 5],
  ],
});

// 3-3: a clamshell halfpipe with bumpers in the trough.
{
  const a: Vec = [0, 0, -3];
  const b: Vec = [0, -6, -39];
  const at = (z: number) => a[1] + ((z - a[2]) / (b[2] - a[2])) * (b[1] - a[1]);
  S.push({
    id: "3-3",
    name: "Clam Halfpipe",
    world: 2,
    time: 60,
    start: [0, 0, 0],
    heading: 0,
    goal: { at: [0, -6, -44], heading: 0 },
    parts: [
      floorZ(0, 0, 3, -3, 4, { tone: "alt" }),
      ...halfpipe(a, b, 4.5, 80, 11),
      ...[-13, -23, -32].map((z) => bumper(0, at(z), z, 1, 1.4)),
      floorZ(0, -6, -38.8, -48, 9, { tone: "alt" }),
    ],
    flies: [
      ...[-10, -15, -20, -25, -30].map((z, i) => ({ at: [(i % 2 ? 1 : -1) * 3.4, at(z) + 1.7, z] as Vec })),
      ...[-10, -15, -20, -25, -30].map((z, i) => ({ at: [(i % 2 ? -1 : 1) * 2.2, at(z) + 1, z] as Vec })),
      big(0, at(-36), -36),
    ],
    route: [
      [0, 0, -5, 5],
      [-2.6, at(-11), -11, 6],
      [-2.6, at(-15), -15, 6],
      [2.6, at(-21), -21, 6],
      [2.6, at(-25), -25, 6],
      [-2.6, at(-30), -30, 6],
      [-2.6, at(-34), -34, 6],
      [0, -6, -40, 6],
      [0, -6, -44, 6],
    ],
  });
}

// 4-1: roll off onto a bouncy mushroom, then hop down the caps.
S.push({
  id: "4-1",
  name: "Mushroom Hop",
  world: 3,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, -5, -41], heading: 0 },
  parts: [
    floorZ(0, 0, 3, -4, 5, { tone: "alt" }),
    disc(0, -3, -8, 1.9, { tone: "spring", spring: 17 }),
    { shape: "cyl", at: [0, -6, -8], r: 0.6, h: 5, tone: "pillar" },
    floorZ(0, -1, -11, -22, 6),
    disc(-1.5, -2, -24.5, 2.2, { tone: "cap" }),
    disc(2, -3, -29, 2.2, { tone: "cap" }),
    disc(-1, -4, -33.5, 2.2, { tone: "cap" }),
    disc(0, -5, -40, 4),
  ],
  flies: [
    { at: [0, 0.5, -9] },
    { at: [0, 1.2, -10.5] },
    ...flyLine([0, -1, -14], [0, -1, -20], 3),
    { at: [-1.5, -1.45, -24.5] },
    { at: [2, -2.45, -29] },
    { at: [-1, -3.45, -33.5] },
    big(2.5, -5, -40),
  ],
  route: [
    [0, 0, -4.5, 7],
    [0, -1, -16, 6],
    [0, -1, -21, 4],
    [-1.5, -2, -24.5, 4],
    [2, -3, -29, 4.5],
    [-1, -4, -33.5, 4.5],
    [0, -5, -42, 5],
  ],
});

// 4-2: rocking mushroom stems.
S.push({
  id: "4-2",
  name: "Swaying Stems",
  world: 3,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, 0, -37], heading: 0 },
  parts: [
    floorZ(0, 0, 3, -3, 5, { tone: "alt" }),
    floorZ(0, 0, -3.1, -11, 2.6, { tone: "moving", swing: { amp: 8, period: 3.4, pivot: [0, 0, -7] } }),
    disc(0, 0, -12.5, 1.6),
    floorZ(0, 0, -14, -22, 2.4, { tone: "moving", swing: { amp: 10, period: 3, phase: 0.5, pivot: [0, 0, -18] } }),
    disc(0, 0, -23.5, 1.6),
    floorZ(0, 0, -25, -33, 2.4, { tone: "moving", swing: { amp: 12, period: 2.6, phase: 0.25, pivot: [0, 0, -29] } }),
    floorZ(0, 0, -33.1, -42, 7, { tone: "alt" }),
  ],
  flies: [...flyLine([0, 0, -4.5], [0, 0, -9.5], 3), ...flyLine([0, 0, -15], [0, 0, -21], 3), ...flyLine([0, 0, -26], [0, 0, -32], 3), big(0, 0, -12.5)],
  route: [
    [0, 0, -3, 3],
    [0, 0, -12.5, 3.5],
    [0, 0, -23.5, 3.5],
    [0, 0, -33, 3.5],
    [0, 0, -37, 5],
  ],
});

// 4-3: spiral down around a giant mushroom stalk.
{
  const c: Vec = [0, 0, -9];
  const R = 6;
  const pts: Vec[] = [];
  for (let k = 0; k <= 12; k++) {
    const phi = (-k * 45 * Math.PI) / 180;
    pts.push([c[0] + Math.sin(phi) * R, -k * 0.9, c[2] + Math.cos(phi) * R]);
  }
  const end = pts[pts.length - 1];
  const out: Vec = [end[0] + 7, end[1] - 0.6, end[2]];
  S.push({
    id: "4-3",
    name: "Spiral Stalk",
    world: 3,
    time: 75,
    start: [0, 0, 1.5],
    heading: 0,
    goal: { at: [out[0] + 4.5, out[1], out[2]], heading: -90 },
    parts: [
      floorZ(0, 0, 4, -0.5, 4, { tone: "alt" }),
      ...road([[0, 0, -0.5], ...pts, out], 2.6),
      { shape: "cyl", at: [c[0], -6, c[2]], r: R - 1.3 - 0.1, h: 20, tone: "pillar" },
      disc(c[0], 4.4, c[2], 5.4, { tone: "cap", thick: 1.2 }),
      floor(out[0] + 4, out[1], out[2], 8, 7, { tone: "alt" }),
    ],
    flies: [...pts.slice(1, 12).map((p) => ({ at: [p[0], p[1] + 0.55, p[2]] as Vec })), big(out[0] + 6, out[1], out[2] + 2.5)],
    route: [[0, 0, -2, 4], ...pts.map((p): Waypoint => [p[0], p[1], p[2], 4.5, 1.3]), [out[0], out[1], out[2], 5], [out[0] + 4.5, out[1], out[2], 5]],
  });
}

// 5-1: sweeper arms turn over a round platform.
{
  const c: Vec = [0, 0, -14];
  const arm = (yaw: number): PartDef => ({
    shape: "box",
    at: [c[0], 0.45, c[2]],
    size: [16, 0.9, 0.8],
    rot: [0, yaw, 0],
    tone: "bumper",
    spin: { speed: 45 },
  });
  S.push({
    id: "5-1",
    name: "Orbit",
    world: 4,
    time: 60,
    start: [0, 0, 0],
    heading: 0,
    goal: { at: [0, 0, -28], heading: 0 },
    parts: [
      floorZ(0, 0, 3, -3, 5, { tone: "alt" }),
      floorZ(0, 0, -3, -5.05, 3),
      disc(c[0], 0, c[2], 9, { tone: "floor" }),
      arm(0),
      arm(90),
      { shape: "cyl", at: [c[0], 0.6, c[2]], r: 1, h: 1.2, tone: "pillar" },
      floorZ(0, 0, -22.95, -32, 6, { tone: "alt" }),
    ],
    flies: [...flyRing(c[0], 0, c[2], 4, 8, Math.PI / 8), ...flyRing(c[0], 0, c[2], 7.5, 6), big(0, 0, -30)],
    route: [
      [0, 0, -4.5, 4],
      [0, 0, -5.5, 3],
      [3.5, 0, -10, 6],
      [3.5, 0, -18, 6],
      [0, 0, -23, 6],
      [0, 0, -28, 6],
    ],
  });
}

// 5-2: a skinny comet trail with a drifting gap.
S.push({
  id: "5-2",
  name: "Comet Trail",
  world: 4,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [-2, -1.5, -48.5], heading: 0 },
  parts: [
    floorZ(0, 0, 3, -2, 4, { tone: "alt" }),
    ...road(
      [
        [0, 0, -2],
        [0, 0, -8],
        [-3, -0.5, -12],
        [-3, -0.5, -17],
        [1, -1, -21],
        [1, -1, -24],
      ],
      1.7
    ),
    floor(1, -1, -27, 2.4, 3.8, { tone: "moving", move: { by: [0, 0, 1.5], period: 4 } }),
    ...road(
      [
        [1, -1, -30],
        [1, -1, -36],
        [-2, -1.5, -40],
        [-2, -1.5, -44],
      ],
      1.7
    ),
    disc(-2, -1.5, -47.5, 3.5),
  ],
  flies: [
    ...flyLine([0, 0, -3], [0, 0, -7], 3),
    ...flyLine([-3, -0.5, -13], [-3, -0.5, -16], 2),
    ...flyLine([1, -1, -31], [1, -1, -35], 3),
    big(1, -1, -27),
    ...flyLine([-2, -1.5, -41], [-2, -1.5, -43], 2),
  ],
  route: [
    [0, 0, -8, 4.5, 0.8],
    [-3, -0.5, -12, 4.5, 0.8],
    [-3, -0.5, -17, 4.5, 0.8],
    [1, -1, -21, 4.5, 0.8],
    [1, -1, -24, 3, 0.8],
    [1, -1, -26.6, 2.5, 0.5, [4, 0.3, 0.9]],
    [1, -1, -31, 6, 0.8, [4, 2.1, 2.6]],
    [1, -1, -36, 4.5, 0.8],
    [-2, -1.5, -40, 4.5, 0.8],
    [-2, -1.5, -44, 4.5, 0.8],
    [-2, -1.5, -48.5, 5],
  ],
});

// 5-3: everything at once.
{
  const orbit: Vec = [0, -6, -36];
  S.push({
    id: "5-3",
    name: "Dream's End",
    world: 4,
    time: 90,
    start: [0, 0, 0],
    heading: 0,
    goal: { at: [0, -6, -67], heading: 0 },
    parts: [
      floorZ(0, 0, 3, -6, 6, { tone: "alt" }),
      ramp([0, 0, -6], [0, -4, -18], 4),
      ...rails([0, 0, -6], [0, -4, -18], 4),
      ramp([0, -4, -18], [0, -3, -22], 4, { tone: "alt" }),
      floorZ(0, -6, -25, -44, 12),
      ...[0, 180].map((a) =>
        bumper(Math.sin((a * Math.PI) / 180) * 3, -6, orbit[2] + Math.cos((a * Math.PI) / 180) * 3, 0.8, 1.2, { spin: { speed: 90, pivot: orbit } })
      ),
      floorZ(0, -6, -44, -54, 1.8),
      ...[-47, -51].map(
        (z, i): PartDef => ({ shape: "box", at: [0, -5.5, z], size: [1.2, 1, 1.2], tone: "bumper", move: { by: [2.4, 0, 0], period: 3 + i * 0.6, phase: i * 0.5 } })
      ),
      floorZ(0, -6, -54.1, -62, 2.4, { tone: "moving", swing: { amp: 10, period: 3, pivot: [0, -6, -58] } }),
      disc(0, -6, -66, 4),
    ],
    pads: [{ at: [0, 0, -3], heading: 0 }],
    flies: [
      ...flyLine([0, -1, -9], [0, -3, -15], 3),
      { at: [0, -2.5, -25] },
      { at: [0, -3, -28] },
      ...flyRing(orbit[0], -6, orbit[2], 5.5, 6),
      ...flyLine([0, -6, -45], [0, -6, -53], 4),
      big(0, -6, -58),
    ],
    route: [
      [0, 0, -6, 30],
      [0, -4, -18, 30],
      [0, -3, -22, 30],
      [0, -6, -30, 5, 1.5],
      [-5, -6, -36, 5],
      [0, -6, -43, 4],
      [0, -6, -54, 3.5, 0.8],
      [0, -6, -62, 3.5, 0.8],
      [0, -6, -67, 5],
    ],
  });
}

export const STAGES = S;

// --- co-op stages ---------------------------------------------------------------------
// Two chained balls, one per player. Paths are wider and goals wide enough
// for both balls side by side; either ball through the goal clears it.

const COOP_GOAL_W = 6;
const C: StageDef[] = [];

C.push({
  id: "C-1",
  name: "Buddy Bridge",
  world: 0,
  time: 60,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, -3, -42], heading: 0, width: COOP_GOAL_W },
  parts: [floorZ(0, 0, 4, -20, 10), ramp([0, 0, -20], [0, -3, -34], 10, { tone: "alt" }), floorZ(0, -3, -34, -48, 10)],
  flies: [...flyLine([-2.5, 0, -5], [-2.5, 0, -17], 4), ...flyLine([2.5, 0, -5], [2.5, 0, -17], 4), big(0, -3, -38)],
  route: [
    [0, 0, -18, 6],
    [0, -3, -45, 6],
  ],
});

// Each ball gets its own rail, with nothing between them.
C.push({
  id: "C-2",
  name: "Moonbeam Rails",
  world: 3,
  time: 75,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, 0, -36], heading: 0, width: COOP_GOAL_W },
  parts: [
    floorZ(0, 0, 4, -4, 8, { tone: "alt" }),
    floorZ(-1.5, 0, -4, -28, 1.6),
    floorZ(1.5, 0, -4, -28, 1.6),
    floorZ(0, 0, -28, -42, 9, { tone: "alt" }),
  ],
  flies: [...flyLine([-1.5, 0, -6], [-1.5, 0, -26], 6), ...flyLine([1.5, 0, -6], [1.5, 0, -26], 6), big(0, 0, -32)],
  route: [
    [0, 0, -3, 3.5],
    [0, 0, -28, 4, 1.4],
    [0, 0, -39, 5],
  ],
});

// A carousel with a bumper in the middle to steer round together.
{
  const c: Vec = [0, 0, -17];
  C.push({
    id: "C-3",
    name: "Carousel Duet",
    world: 1,
    time: 60,
    start: [0, 0, 0],
    heading: 0,
    goal: { at: [0, 0, -36], heading: 0, width: COOP_GOAL_W },
    parts: [
      floorZ(0, 0, 4, -4, 7, { tone: "alt" }),
      floorZ(0, 0, -4, -7.95, 6),
      disc(c[0], 0, c[2], 9, { tone: "moving", spin: { speed: 20 } }),
      bumper(c[0], 0, c[2], 1, 1.2, { spin: { speed: 20 } }),
      floorZ(0, 0, -26.05, -30, 6),
      floorZ(0, 0, -30, -42, 9, { tone: "alt" }),
    ],
    flies: [...flyRing(c[0], 0, c[2], 5.5, 10), big(0, 0, -28)],
    route: [
      [0, 0, -8.6, 4],
      [-4, 0, -13, 4],
      [-4, 0, -21, 4],
      [0, 0, -26, 4],
      [0, 0, -39, 5],
    ],
  });
}

// Two seesaws: one rocks side to side, one tips forward and back.
C.push({
  id: "C-4",
  name: "Lily Seesaw",
  world: 0,
  time: 70,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, 0, -35], heading: 0, width: COOP_GOAL_W },
  parts: [
    floorZ(0, 0, 4, -3, 7, { tone: "alt" }),
    floorZ(0, 0, -3.1, -15, 6, { tone: "moving", swing: { amp: 8, period: 4, pivot: [0, 0, -9] } }),
    floorZ(0, 0, -15.1, -18, 6),
    floorZ(0, 0, -18.1, -28, 6, { tone: "moving", swing: { amp: 6, period: 3.5, axis: [1, 0, 0], pivot: [0, 0, -23] } }),
    floorZ(0, 0, -28.1, -40, 9, { tone: "alt" }),
  ],
  flies: [...flyLine([-2, 0, -5], [-2, 0, -13], 3), ...flyLine([2, 0, -5], [2, 0, -13], 3), ...flyLine([0, 0, -19], [0, 0, -27], 4), big(0, 0, -16.5)],
  route: [
    [0, 0, -3, 3.5],
    [0, 0, -16.5, 3.5],
    [0, 0, -28, 3.5],
    [0, 0, -38, 5],
  ],
});

// Two lanes swept by drifting blocks. Each block swings wide enough to clear
// both lanes for a moment at each end of its swing.
{
  const pushers = [
    { z: -11, period: 3.6, phase: 0 },
    { z: -19, period: 4.1, phase: 0.3 },
    { z: -26, period: 4.6, phase: 0.6 },
  ];
  const AMP = 4.2;
  // The autopilot waits before each block and goes so it passes the block
  // just as the block reaches the end of its swing (twice a period).
  const route: Waypoint[] = [[0, 0, -3, 3.5]];
  for (const b of pushers) {
    const half = b.period / 2;
    const peak = (((0.25 - b.phase) * b.period) % half + half) % half;
    const from = (peak - 1.05 + half) % half;
    const to = (peak - 0.75 + half) % half;
    route.push([0, 0, b.z + 2.4, 3, 0.9]);
    route.push([0, 0, b.z - 1.6, 4.5, 0.9, [half, from, to]]);
  }
  route.push([0, 0, -30, 3.5, 1.4], [0, 0, -41, 5]);
  C.push({
    id: "C-5",
    name: "Current Lanes",
    world: 2,
    time: 90,
    start: [0, 0, 0],
    heading: 0,
    goal: { at: [0, 0, -38], heading: 0, width: COOP_GOAL_W },
    parts: [
      floorZ(0, 0, 4, -4, 8, { tone: "alt" }),
      floorZ(-1.5, 0, -4, -30, 1.9),
      floorZ(1.5, 0, -4, -30, 1.9),
      ...pushers.map((b): PartDef => ({ shape: "box", at: [0, 0.5, b.z], size: [1.2, 1, 1.4], tone: "bumper", move: { by: [AMP, 0, 0], period: b.period, phase: b.phase } })),
      floorZ(0, 0, -30, -44, 9, { tone: "alt" }),
    ],
    flies: [...flyLine([-1.5, 0, -6], [-1.5, 0, -28], 6), ...flyLine([1.5, 0, -6], [1.5, 0, -28], 6), big(0, 0, -34)],
    route,
  });
}

// A chained ski jump, then a narrow bridge to the goal island.
C.push({
  id: "C-6",
  name: "Dream Duet",
  world: 4,
  time: 90,
  start: [0, 0, 0],
  heading: 0,
  goal: { at: [0, -8, -62], heading: 0, width: COOP_GOAL_W },
  parts: [
    floorZ(0, 0, 4, -6, 9, { tone: "alt" }),
    ramp([0, 0, -6], [0, -5, -22], 9),
    ...rails([0, 0, -6], [0, -5, -22], 9),
    ramp([0, -5, -22], [0, -4, -26], 9, { tone: "alt" }),
    floorZ(0, -8, -30, -50, 13),
    floorZ(0, -8, -50, -57.5, 6),
    disc(0, -8, -62, 5),
  ],
  pads: [
    { at: [-1.4, 0, -3], heading: 0 },
    { at: [1.4, 0, -3], heading: 0 },
  ],
  flies: [...flyLine([-2.5, -1, -9], [-2.5, -4, -19], 3), ...flyLine([2.5, -1, -9], [2.5, -4, -19], 3), { at: [0, -3, -30] }, { at: [0, -4, -34] }, ...flyLine([0, -8, -51], [0, -8, -56], 3), big(0, -8, -44)],
  route: [
    [0, 0, -6, 30],
    [0, -5, -22, 30],
    [0, -4, -26, 30],
    [0, -8, -40, 5, 1.5],
    [0, -8, -50, 3.5],
    [0, -8, -65, 4],
  ],
});

export const COOP_STAGES = C;
