// Draws Mystery Crypt onto a 2D canvas, top-down. The dungeon's floor and
// walls are painted in code once per floor; the characters are the 8 Bit Evil
// sprites. Units glide between tiles, so the turn-based rules feel smooth.
// Reads the state; never changes it.
import { isFloor, leader, MAP_H, MAP_W, type GameEvent, type GameState, type Pickup, type Unit, type UnitKind } from "./sim";

const T = 16;
const FONT = "CCDigits, Pixelify, monospace";

interface SheetDef {
  url: string;
  fw: number;
  fh: number;
  frames: number;
  // Drawn size relative to the sheet's pixels.
  scale: number;
}

const sheet = (url: string, fw: number, fh: number, frames: number, scale = 1): SheetDef => ({ url, fw, fh, frames, scale });

export const UNIT_SHEETS: Record<UnitKind, SheetDef> = {
  joe: sheet("/royale/joe_idle.png", 16, 24, 6),
  matt: sheet("/royale/matt_idle.png", 16, 24, 6),
  alex: sheet("/royale/ui/alex_idle.png", 16, 24, 6),
  jon: sheet("/royale/ui/jon_idle.png", 16, 24, 5),
  rat: sheet("/sprites/rat.png", 16, 16, 6),
  imp: sheet("/sprites/imp.png", 16, 16, 4),
  pumpkin: sheet("/sprites/pumpkin.png", 16, 16, 6),
  skull: sheet("/sprites/skullsprite.png", 24, 18, 6, 0.85),
  zombie: sheet("/sprites/zombiesprite-1.png", 16, 24, 6),
  candle: sheet("/sprites/candle.png", 32, 32, 6, 0.75),
  ghost: sheet("/sprites/ghost.png", 16, 32, 6, 0.8),
  scarecrow: sheet("/sprites/scarecrow.png", 24, 48, 6, 0.6),
  werewolf: sheet("/sprites/werewolfsprite.png", 30, 26, 7, 0.85),
  ufo: sheet("/sprites/ufo.png", 32, 26, 6, 0.8),
  shadowbeast: sheet("/sprites/shadowbeast.png", 32, 32, 6, 0.85),
  swampthing: sheet("/sprites/swampthing.png", 34, 58, 6, 0.52),
};

const ITEM_SHEETS = {
  candybar: sheet("/sprites/candybarsprite.png", 24, 24, 5, 0.6),
  gum: sheet("/sprites/bubblegumsprite.png", 24, 24, 6, 0.6),
  candycorn: sheet("/sprites/candycornsprite.png", 24, 24, 6, 0.55),
  heart: sheet("/royale/ui/heart.png", 16, 16, 1, 0.75),
  chest: sheet("/royale/ui/chest.png", 32, 32, 1, 0.5),
  lamp: sheet("/royale/ui/lamp.png", 16, 64, 4, 0.3),
};

type SheetId = UnitKind | keyof typeof ITEM_SHEETS;
const ALL_SHEETS: Record<SheetId, SheetDef> = { ...UNIT_SHEETS, ...ITEM_SHEETS };

// Colours for the bits that fly off when something is beaten.
const GORE: Partial<Record<UnitKind, string>> = {
  rat: "#9a8a9c", skull: "#f2efe6", imp: "#e0463a", pumpkin: "#ff8a1f", zombie: "#6fbf4a", ghost: "#cfe8ff",
  candle: "#ffd36a", werewolf: "#8a6a4a", scarecrow: "#d6b25a", ufo: "#6ae0ff", shadowbeast: "#8a4ad6", swampthing: "#4a9a5a",
};

export type Assets = Record<SheetId, HTMLImageElement>;

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

let assetsPromise: Promise<Assets> | null = null;
export function loadAssets() {
  assetsPromise ??= (async () => {
    const ids = Object.keys(ALL_SHEETS) as SheetId[];
    const imgs = await Promise.all(ids.map((id) => loadImage(ALL_SHEETS[id].url)));
    await Promise.all([document.fonts?.load("700 20px Pixelify"), document.fonts?.load("20px CCDigits", "0123456789")].map((p) => p?.catch(() => undefined)));
    return Object.fromEntries(ids.map((id, i) => [id, imgs[i]])) as Assets;
  })();
  return assetsPromise;
}

// ---------- dungeon painting ----------

interface Theme {
  floor: [string, string, string];
  seam: string;
  wallTop: string;
  wallRim: string;
  brick: [string, string];
  mortar: string;
  fog: string;
}

// The look changes every four floors.
const THEMES: Theme[] = [
  // Purple crypt
  { floor: ["#3a2d4c", "#34283f", "#413353"], seam: "#231a30", wallTop: "#150d1f", wallRim: "#6b5690", brick: ["#4e3b68", "#443359"], mortar: "#241a33", fog: "#0b0712" },
  // Mossy catacomb
  { floor: ["#2d3a2f", "#283329", "#344236"], seam: "#18221a", wallTop: "#0c140e", wallRim: "#5e8a5a", brick: ["#3f5a3f", "#364e37"], mortar: "#1a2a1c", fog: "#060d08" },
  // Blood cellar
  { floor: ["#402326", "#381e21", "#4a2a2d"], seam: "#231013", wallTop: "#170709", wallRim: "#9a4a4a", brick: ["#5e2e30", "#522628"], mortar: "#2a1012", fog: "#0e0405" },
  // Frozen bone vault
  { floor: ["#343a4c", "#2e3344", "#3b4256"], seam: "#1c2030", wallTop: "#0c0f1a", wallRim: "#8aa6d6", brick: ["#465274", "#3d4766"], mortar: "#1e2438", fog: "#05070e" },
];

export function themeFor(floor: number) {
  return THEMES[Math.floor((floor - 1) / 4) % THEMES.length];
}

// Cheap per-tile noise so the painting is the same every time for a floor.
function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2246822519, 3266489917);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

function paintDungeon(s: GameState) {
  const canvas = document.createElement("canvas");
  canvas.width = MAP_W * T;
  canvas.height = MAP_H * T;
  const g = canvas.getContext("2d")!;
  const th = themeFor(s.floor);
  const seed = s.seed + s.floor * 101;
  g.fillStyle = th.wallTop;
  g.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const px = x * T;
      const py = y * T;
      const r = hash(x, y, seed);
      if (isFloor(s, x, y)) {
        // Stone slabs in a few shades, a dark seam round each, and grit.
        g.fillStyle = th.floor[Math.floor(r * 3)];
        g.fillRect(px, py, T, T);
        g.fillStyle = th.seam;
        g.fillRect(px, py, T, 1);
        g.fillRect(px, py, 1, T);
        for (let n = 0; n < 4; n++) {
          const gx = Math.floor(hash(x, y, seed + n * 7) * 14) + 1;
          const gy = Math.floor(hash(y, x, seed + n * 13) * 14) + 1;
          g.fillStyle = n % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
          g.fillRect(px + gx, py + gy, 1, 1);
        }
        if (r > 0.93) {
          // A crack.
          g.fillStyle = th.seam;
          let cx = px + 3 + Math.floor(hash(x, y, seed + 3) * 8);
          let cy = py + 3;
          for (let n = 0; n < 8; n++) {
            g.fillRect(cx, cy, 1, 1);
            cy++;
            cx += hash(x + n, y, seed) < 0.5 ? 0 : 1;
          }
        } else if (r < 0.03) {
          // Bones.
          g.fillStyle = "#d8cfbf";
          g.fillRect(px + 4, py + 9, 7, 1);
          g.fillRect(px + 3, py + 8, 2, 3);
          g.fillRect(px + 10, py + 8, 2, 3);
        }
        // Walls cast a shadow on the floor below them.
        if (!isFloor(s, x, y - 1)) {
          g.fillStyle = "rgba(0,0,0,0.35)";
          g.fillRect(px, py, T, 3);
        }
        if (!isFloor(s, x - 1, y)) {
          g.fillStyle = "rgba(0,0,0,0.2)";
          g.fillRect(px, py, 2, T);
        }
      } else if (isFloor(s, x, y + 1)) {
        // Wall seen from the front: bricks.
        g.fillStyle = th.mortar;
        g.fillRect(px, py, T, T);
        for (let row = 0; row < 4; row++) {
          const off = (row + y) % 2 ? 4 : 0;
          for (let bx = -off; bx < T; bx += 8) {
            g.fillStyle = th.brick[(hash(x * 4 + row, bx + y * 3, seed) * 2) | 0];
            const x0 = Math.max(0, bx + 1);
            const x1 = Math.min(T, bx + 8);
            g.fillRect(px + x0, py + row * 4 + 1, x1 - x0, 3);
          }
        }
        g.fillStyle = th.wallRim;
        g.fillRect(px, py, T, 1);
        g.fillStyle = "rgba(0,0,0,0.3)";
        g.fillRect(px, py + T - 2, T, 2);
      } else {
        // Wall top: dark, with a light rim where it meets the floor.
        if (r > 0.7) {
          g.fillStyle = "rgba(255,255,255,0.03)";
          g.fillRect(px + 2, py + 2, T - 4, T - 4);
        }
        g.fillStyle = th.wallRim;
        if (isFloor(s, x - 1, y) || isFloor(s, x - 1, y + 1)) g.fillRect(px, py, 1, T);
        if (isFloor(s, x + 1, y) || isFloor(s, x + 1, y + 1)) g.fillRect(px + T - 1, py, 1, T);
        if (isFloor(s, x, y - 1)) g.fillRect(px, py, T, 1);
      }
    }
  }

  // The stairs down.
  const sx = s.stairs.x * T;
  const sy = s.stairs.y * T;
  g.fillStyle = "#07040b";
  g.fillRect(sx + 1, sy + 1, T - 2, T - 2);
  const steps = ["#9a8ab0", "#6e6088", "#4a3f60", "#2c2440"];
  steps.forEach((c, i) => {
    g.fillStyle = c;
    g.fillRect(sx + 2 + i, sy + 2 + i * 3, T - 4 - i * 2, 2);
  });
  g.strokeStyle = "#ffcf4a";
  g.globalAlpha = 0.6;
  g.strokeRect(sx + 0.5, sy + 0.5, T - 1, T - 1);
  g.globalAlpha = 1;
  return canvas;
}

// ---------- animation state ----------

interface Shown {
  kind: UnitKind;
  team: Unit["team"];
  x: number;
  y: number;
  // Faces left?
  flip: boolean;
  lunge: { dx: number; dy: number; t: number } | null;
  flash: number;
  joined: number;
  phase: number;
}

interface Floater {
  text: string;
  color: string;
  x: number;
  y: number;
  t: number;
  life: number;
  big?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
}

interface Corpse {
  kind: UnitKind;
  x: number;
  y: number;
  flip: boolean;
  t: number;
}

interface Projectile {
  from: { x: number; y: number };
  to: { x: number; y: number };
  t: number;
  life: number;
}

const MOVE_TIME = 0.11;
const LUNGE_TIME = 0.16;
// Tiles across the screen.
const VIEW_TILES = 9.5;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private time = 0;
  private dungeon: HTMLCanvasElement | null = null;
  private dungeonFor: Uint8Array | null = null;
  private fog = document.createElement("canvas");
  private fogVersion = -1;
  private fogFor: Uint8Array | null = null;
  private shown = new Map<number, Shown>();
  private floaters: Floater[] = [];
  private particles: Particle[] = [];
  private corpses: Corpse[] = [];
  private projectiles: Projectile[] = [];
  private cam: { x: number; y: number } | null = null;
  private shake = 0;
  // Where the map's top-left corner was last drawn, in CSS px.
  private origin = { x: 0, y: 0 };
  // Extra room kept clear at the bottom (the controls) and top (the HUD), in CSS px.
  insetTop = 0;
  insetBottom = 0;

  constructor(private canvas: HTMLCanvasElement, private assets: Assets) {
    this.ctx = canvas.getContext("2d")!;
    this.fog.width = MAP_W;
    this.fog.height = MAP_H;
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  // CSS px per dungeon pixel.
  private get zoom() {
    return Math.max(2, this.w / (T * VIEW_TILES));
  }

  // The tile under a point on the canvas (CSS px), for tap-to-walk.
  screenToTile(sx: number, sy: number) {
    const k = this.zoom * T;
    return { x: Math.floor((sx - this.origin.x) / k), y: Math.floor((sy - this.origin.y) / k) };
  }

  // True while units are still sliding or swinging, so the next turn waits.
  busy() {
    for (const u of this.shown.values()) if (u.lunge) return true;
    return this.projectiles.length > 0;
  }

  handleEvents(s: GameState, events: GameEvent[]) {
    for (const e of events) {
      if (e.type === "attack") {
        const u = this.shown.get(e.id);
        const unit = s.units.find((o) => o.id === e.id);
        if (u && unit) {
          u.lunge = { dx: e.x - unit.x, dy: e.y - unit.y, t: 0 };
          if (e.x !== unit.x) u.flip = e.x < unit.x;
        }
      } else if (e.type === "hit") {
        const u = this.shown.get(e.id);
        if (u) u.flash = 0.18;
        this.float(`${e.amount}`, e.team === "party" ? "#ff5a6a" : "#ffffff", e.x, e.y);
        if (e.id === s.leaderId) this.shake = 0.2;
        this.burst(e.x, e.y, e.team === "party" ? "#ff5a6a" : "#ffe9c4", 4);
      } else if (e.type === "miss") {
        this.float("MISS", "#9a8ab0", e.x, e.y);
      } else if (e.type === "die") {
        const u = this.shown.get(e.unit.id);
        this.corpses.push({ kind: e.unit.kind, x: e.unit.x, y: e.unit.y, flip: u?.flip ?? false, t: 0 });
        this.shown.delete(e.unit.id);
        this.burst(e.unit.x, e.unit.y, GORE[e.unit.kind] ?? "#ffcf4a", 14);
      } else if (e.type === "heal") {
        if (e.amount > 0) this.float(`+${e.amount}`, "#7dffb0", e.x, e.y);
      } else if (e.type === "level") {
        this.float("LV UP!", "#7dffb0", e.x, e.y, true);
      } else if (e.type === "recruit") {
        this.float("JOINED!", "#ff9ad5", e.x, e.y, true);
        this.burst(e.x, e.y, "#ff9ad5", 16);
        const u = this.shown.get(e.id);
        if (u) u.joined = 1;
      } else if (e.type === "throw") {
        const dist = Math.abs(e.to.x - e.from.x) + Math.abs(e.to.y - e.from.y);
        this.projectiles.push({ from: e.from, to: e.to, t: 0, life: 0.08 + dist * 0.04 });
      } else if (e.type === "charm") {
        const unit = s.units.find((o) => o.id === e.id);
        if (unit) this.burst(unit.x, unit.y, "#ff9ad5", 10);
      } else if (e.type === "pickup") {
        this.float(e.kind === "candy" ? `+${e.value}` : "", "#ffcf4a", e.x, e.y);
        this.burst(e.x, e.y, "#ffcf4a", 6);
      } else if (e.type === "floor") {
        // New map: everyone appears in place.
        this.shown.clear();
        this.corpses = [];
        this.cam = null;
      }
    }
  }

  private float(text: string, color: string, x: number, y: number, big = false) {
    if (!text) return;
    // Stack floaters on the same tile so they don't overlap.
    const stacked = this.floaters.filter((f) => f.x === x && f.y === y && f.t < 0.3).length;
    this.floaters.push({ text, color, x, y: y - stacked * 0.45, t: 0, life: big ? 1.2 : 0.8, big });
  }

  private burst(x: number, y: number, color: string, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 50;
      this.particles.push({ x: x * T + T / 2, y: y * T + T / 2 - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, t: 0, life: 0.35 + Math.random() * 0.3, color, size: Math.random() < 0.3 ? 2 : 1 });
    }
  }

  // Where each unit is drawn: slides toward its tile.
  private sync(s: GameState, dt: number) {
    const alive = new Set<number>();
    for (const u of s.units) {
      alive.add(u.id);
      let d = this.shown.get(u.id);
      if (!d) {
        d = { kind: u.kind, team: u.team, x: u.x, y: u.y, flip: u.dx < 0, lunge: null, flash: 0, joined: 0, phase: Math.random() * 10 };
        this.shown.set(u.id, d);
      }
      d.team = u.team;
      const ddx = u.x - d.x;
      const ddy = u.y - d.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist > 2.5) {
        d.x = u.x;
        d.y = u.y;
      } else if (dist > 0) {
        const step = Math.min(dist, dt / MOVE_TIME);
        d.x += (ddx / dist) * step;
        d.y += (ddy / dist) * step;
      }
      if (u.dx !== 0) d.flip = u.dx < 0;
      if (d.lunge) {
        d.lunge.t += dt;
        if (d.lunge.t >= LUNGE_TIME) d.lunge = null;
      }
      d.flash = Math.max(0, d.flash - dt);
      d.joined = Math.max(0, d.joined - dt);
    }
    for (const id of this.shown.keys()) if (!alive.has(id)) this.shown.delete(id);
  }

  // How far (in tiles) the leader is drawn from where it really is.
  leaderLag(s: GameState) {
    const l = leader(s);
    const d = l && this.shown.get(l.id);
    return d ? Math.hypot(d.x - l.x, d.y - l.y) : 0;
  }

  draw(s: GameState, dt: number) {
    this.time += dt;
    this.sync(s, dt);
    const g = this.ctx;
    const th = themeFor(s.floor);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = th.fog;
    g.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.dungeonFor !== s.tiles) {
      this.dungeon = paintDungeon(s);
      this.dungeonFor = s.tiles;
    }
    if (this.fogVersion !== s.sightVersion || this.fogFor !== s.explored) this.paintFog(s);

    // Camera follows the leader, centred in the space between HUD and controls.
    const l = leader(s);
    const lead = l ? this.shown.get(l.id) : null;
    const target = lead ? { x: lead.x, y: lead.y } : this.cam ?? { x: MAP_W / 2, y: MAP_H / 2 };
    this.cam = this.cam ? { x: this.cam.x + (target.x - this.cam.x) * Math.min(1, dt * 14), y: this.cam.y + (target.y - this.cam.y) * Math.min(1, dt * 14) } : { ...target };
    const z = this.zoom * this.dpr;
    const viewH = this.h - this.insetTop - this.insetBottom;
    const centreY = this.insetTop + viewH / 2;
    let ox = this.w / 2 - (this.cam.x * T + T / 2) * this.zoom;
    let oy = centreY - (this.cam.y * T + T / 2) * this.zoom;
    if (this.shake > 0) {
      this.shake -= dt;
      ox += (Math.random() - 0.5) * 6;
      oy += (Math.random() - 0.5) * 6;
    }
    // Whole device pixels, so the pixel art doesn't shimmer while scrolling.
    ox = Math.round(ox * this.dpr) / this.dpr;
    oy = Math.round(oy * this.dpr) / this.dpr;
    this.origin = { x: ox, y: oy };
    g.setTransform(z, 0, 0, z, ox * this.dpr, oy * this.dpr);
    g.imageSmoothingEnabled = false;
    g.drawImage(this.dungeon!, 0, 0);

    // Pickups you've seen.
    for (const p of s.pickups) {
      if (!s.explored[p.y * MAP_W + p.x]) continue;
      this.drawPickup(p);
    }

    // Where the leader is facing (attacks and throws go this way).
    if (l && lead && !s.over) {
      const fx = (lead.x + l.dx) * T;
      const fy = (lead.y + l.dy) * T;
      g.globalAlpha = 0.35 + 0.15 * Math.sin(this.time * 6);
      g.strokeStyle = "#ffcf4a";
      g.lineWidth = 1;
      g.strokeRect(fx + 1.5, fy + 1.5, T - 3, T - 3);
      g.globalAlpha = 1;
    }

    // Beaten monsters fade out.
    this.corpses = this.corpses.filter((c) => (c.t += dt) < 0.45);
    for (const c of this.corpses) {
      const k = c.t / 0.45;
      g.globalAlpha = 1 - k;
      this.drawSprite(c.kind, c.x * T + T / 2, c.y * T + T - 2, c.flip, 0, 1 - k * 0.4, true);
      g.globalAlpha = 1;
    }

    // Units, back to front. Enemies only when you can see them.
    const units = s.units
      .map((u) => ({ u, d: this.shown.get(u.id)! }))
      .filter(({ u, d }) => d && (u.team === "party" || s.visible[u.y * MAP_W + u.x] || s.visible[Math.round(d.y) * MAP_W + Math.round(d.x)]))
      .sort((a, b) => a.d.y - b.d.y);
    for (const { u, d } of units) this.drawUnit(s, u, d);

    // Thrown candy corn.
    this.projectiles = this.projectiles.filter((p) => (p.t += dt) < p.life);
    for (const p of this.projectiles) {
      const k = p.t / p.life;
      const x = (p.from.x + (p.to.x - p.from.x) * k) * T + T / 2;
      const y = (p.from.y + (p.to.y - p.from.y) * k) * T + T / 2 - 8 - Math.sin(k * Math.PI) * 10;
      this.drawSheet("candycorn", x, y + 6, false, Math.floor(this.time * 20), 0.45);
    }

    // Sparks.
    this.particles = this.particles.filter((p) => (p.t += dt) < p.life);
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      g.globalAlpha = 1 - p.t / p.life;
      g.fillStyle = p.color;
      g.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    g.globalAlpha = 1;

    // Fog of war, soft-edged: the per-tile fog image drawn smoothed.
    g.imageSmoothingEnabled = true;
    g.drawImage(this.fog, -0.5 * T, -0.5 * T, (MAP_W + 1) * T, (MAP_H + 1) * T);
    g.imageSmoothingEnabled = false;

    // Numbers float above the fog.
    this.floaters = this.floaters.filter((f) => (f.t += dt) < f.life);
    g.textAlign = "center";
    g.textBaseline = "middle";
    for (const f of this.floaters) {
      const k = f.t / f.life;
      const x = f.x * T + T / 2;
      const y = f.y * T - 6 - k * 12;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.font = `${f.big ? 9 : 8}px ${FONT}`;
      g.fillStyle = "#140a1c";
      for (const [ddx, ddy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.fillText(f.text, x + ddx * 0.75, y + ddy * 0.75);
      g.fillStyle = f.color;
      g.fillText(f.text, x, y);
    }
    g.globalAlpha = 1;

    // Screen-space: darken the edges, then the map.
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const vignette = g.createRadialGradient(this.w / 2, centreY, Math.min(this.w, viewH) * 0.35, this.w / 2, centreY, Math.max(this.w, viewH) * 0.75);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = vignette;
    g.fillRect(0, 0, this.w, this.h);
    this.drawMinimap(s);
  }

  private paintFog(s: GameState) {
    this.fogVersion = s.sightVersion;
    this.fogFor = s.explored;
    const g = this.fog.getContext("2d")!;
    const img = g.createImageData(MAP_W, MAP_H);
    const fog = themeFor(s.floor).fog;
    const r = parseInt(fog.slice(1, 3), 16);
    const gg = parseInt(fog.slice(3, 5), 16);
    const b = parseInt(fog.slice(5, 7), 16);
    for (let i = 0; i < MAP_W * MAP_H; i++) {
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = gg;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = s.visible[i] ? 0 : s.explored[i] ? 140 : 255;
    }
    g.putImageData(img, 0, 0);
  }

  private drawSheet(id: SheetId, cx: number, bottom: number, flip: boolean, frame: number, scale = 1) {
    const def = ALL_SHEETS[id];
    const img = this.assets[id];
    const k = def.scale * scale;
    const w = def.fw * k;
    const h = def.fh * k;
    const f = ((frame % def.frames) + def.frames) % def.frames;
    const g = this.ctx;
    if (flip) {
      g.save();
      g.translate(cx, 0);
      g.scale(-1, 1);
      g.drawImage(img, f * def.fw, 0, def.fw, def.fh, -w / 2, bottom - h, w, h);
      g.restore();
    } else {
      g.drawImage(img, f * def.fw, 0, def.fw, def.fh, cx - w / 2, bottom - h, w, h);
    }
    return h;
  }

  private drawSprite(kind: UnitKind, cx: number, bottom: number, flip: boolean, frame: number, scale = 1, white = false) {
    if (!white) return this.drawSheet(kind, cx, bottom, flip, frame, scale);
    // A white silhouette, for hit flashes and fading corpses.
    const g = this.ctx;
    g.save();
    g.filter = "brightness(0) invert(1)";
    const h = this.drawSheet(kind, cx, bottom, flip, frame, scale);
    g.restore();
    return h;
  }

  private drawUnit(s: GameState, u: Unit, d: Shown) {
    const g = this.ctx;
    let x = d.x * T + T / 2;
    let y = d.y * T + T - 2;
    if (d.lunge) {
      const k = Math.sin((d.lunge.t / LUNGE_TIME) * Math.PI);
      x += d.lunge.dx * k * 6;
      y += d.lunge.dy * k * 6;
    }
    // Hop a little while walking.
    const walking = !Number.isInteger(d.x) || !Number.isInteger(d.y);
    const hop = walking ? Math.abs(Math.sin((d.x + d.y) * Math.PI)) * 2 : 0;

    g.fillStyle = "rgba(0,0,0,0.4)";
    g.beginPath();
    g.ellipse(x, y, 5.5, 2, 0, 0, Math.PI * 2);
    g.fill();

    const frame = Math.floor(this.time * 7 + d.phase);
    const scale = d.joined > 0 ? 1 + Math.sin(d.joined * Math.PI) * 0.25 : 1;
    const h = this.drawSprite(u.kind, x, y - hop, d.flip, frame, scale, d.flash > 0.08);
    const top = y - hop - h;

    // Teammates (not the leader) wear a little heart; charmed monsters a pulsing one.
    if (u.team === "party" && u.id !== s.leaderId) this.drawHeart(x, top - 3, 0.35, "#ff9ad5");
    if (u.charmed) this.drawHeart(x, top - 4 - Math.abs(Math.sin(this.time * 4)) * 2, 0.4, "#ff5aa8");

    // Health bars when hurt.
    if (u.hp < u.maxHp) {
      const bw = 12;
      g.fillStyle = "#140a1c";
      g.fillRect(x - bw / 2 - 0.5, y + 1.5, bw + 1, 2.5);
      g.fillStyle = u.team === "party" ? "#7dffb0" : "#ff5a6a";
      g.fillRect(x - bw / 2, y + 2, Math.max(0.5, (bw * u.hp) / u.maxHp), 1.5);
    }
  }

  private drawHeart(cx: number, cy: number, k: number, color: string) {
    const g = this.ctx;
    const px = [
      ".XX.XX.",
      "XXXXXXX",
      "XXXXXXX",
      ".XXXXX.",
      "..XXX..",
      "...X...",
    ];
    const size = k * 2.5;
    g.fillStyle = "#140a1c";
    g.fillRect(cx - 4 * size, cy - 3.5 * size, 8 * size, 7 * size);
    g.fillStyle = color;
    px.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) if (row[i] === "X") g.fillRect(cx + (i - 3.5) * size, cy + (j - 3) * size, size, size);
    });
  }

  private drawPickup(p: Pickup) {
    const x = p.x * T + T / 2;
    const bob = Math.sin(this.time * 3 + p.id) * 1;
    const y = p.y * T + T - 3 + bob;
    const g = this.ctx;
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse(x, p.y * T + T - 3, 4, 1.5, 0, 0, Math.PI * 2);
    g.fill();
    const frame = Math.floor(this.time * 6 + p.id);
    if (p.kind === "candy") this.drawSheet(p.id % 2 ? "candybar" : "gum", x, y + 2, false, frame);
    else if (p.kind === "lamp") this.drawLantern(x, y);
    else this.drawSheet(p.kind, x, y + (p.kind === "chest" ? 1 : 0), false, frame);
  }

  // A little lantern (the lamp-post sprite is too tall for a tile).
  private drawLantern(cx: number, bottom: number) {
    const g = this.ctx;
    const glow = 0.5 + 0.3 * Math.sin(this.time * 5);
    g.fillStyle = `rgba(255,200,80,${glow * 0.35})`;
    g.beginPath();
    g.arc(cx, bottom - 5, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#140a1c";
    g.fillRect(cx - 3, bottom - 10, 6, 10);
    g.fillStyle = "#6e6088";
    g.fillRect(cx - 1, bottom - 12, 2, 2);
    g.fillStyle = "#ffcf4a";
    g.fillRect(cx - 2, bottom - 8, 4, 6);
    g.fillStyle = "#fff4c4";
    g.fillRect(cx - 1, bottom - 6, 2, 3);
  }

  private drawMinimap(s: GameState) {
    const g = this.ctx;
    const cell = Math.max(2, Math.floor(Math.min(this.w * 0.3, 140) / MAP_W));
    const mw = MAP_W * cell;
    const x0 = this.w - mw - 8;
    const y0 = this.insetTop + 6;
    g.globalAlpha = 0.8;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        if (!s.explored[i] || !isFloor(s, x, y)) continue;
        g.fillStyle = s.visible[i] ? "#8a78b0" : "#4a3f64";
        g.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
      }
    }
    if (s.explored[s.stairs.y * MAP_W + s.stairs.x]) {
      g.fillStyle = "#ffcf4a";
      g.fillRect(x0 + s.stairs.x * cell - 1, y0 + s.stairs.y * cell - 1, cell + 2, cell + 2);
    }
    for (const p of s.pickups) {
      if (!s.explored[p.y * MAP_W + p.x]) continue;
      g.fillStyle = "#6ae0ff";
      g.fillRect(x0 + p.x * cell, y0 + p.y * cell, cell, cell);
    }
    for (const u of s.units) {
      if (u.team === "enemy" && !s.visible[u.y * MAP_W + u.x]) continue;
      g.fillStyle = u.id === s.leaderId ? "#ffffff" : u.team === "party" ? "#ff9ad5" : "#ff5a6a";
      g.fillRect(x0 + u.x * cell - 0.5, y0 + u.y * cell - 0.5, cell + 1, cell + 1);
    }
    g.globalAlpha = 1;
  }
}
