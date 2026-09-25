// Draws a Horde Rush state onto a 2D canvas: a pixel-art road running into
// the distance (drawn a scanline at a time, like old racing games) with
// every sprite scaled by its depth. Reads the state; never changes it.
import { MAX_VISIBLE_SOLDIERS, MONSTERS, ROAD_HALF, SOLDIER_SPACING, squadRadius, type Barrel, type Enemy, type GameEvent, type GameState, type Gate, type MonsterId } from "./sim";

interface SheetDef {
  url: string;
  fw: number;
  fh: number;
  frames: number;
  // Height in world units when drawn at normal size.
  height: number;
}

// Your army is the 8 Bit Evil Returns crew; the horde is the 8 Bit Evil roster.
const HEROES = ["joe", "matt", "alex", "jon"] as const;
const monster = (url: string, fw: number, fh: number, frames: number, scale: number): SheetDef => ({ url, fw, fh, frames, height: (fh * scale) / 64 });

const SHEETS = {
  joe: { url: "/royale/joe_idle.png", fw: 16, fh: 24, frames: 6, height: 0.9 },
  matt: { url: "/royale/matt_idle.png", fw: 16, fh: 24, frames: 6, height: 0.95 },
  alex: { url: "/royale/ui/alex_idle.png", fw: 16, fh: 24, frames: 6, height: 0.9 },
  jon: { url: "/royale/ui/jon_idle.png", fw: 16, fh: 24, frames: 5, height: 0.9 },
  rat: monster("/sprites/rat.png", 16, 16, 6, 4),
  skull: monster("/sprites/skullsprite.png", 24, 18, 6, 4),
  imp: monster("/sprites/imp.png", 16, 16, 4, 4),
  pumpkin: monster("/sprites/pumpkin.png", 16, 16, 6, 4),
  zombie: monster("/sprites/zombiesprite-1.png", 16, 24, 6, 4),
  ghost: monster("/sprites/ghost.png", 16, 32, 6, 3.5),
  candle: monster("/sprites/candle.png", 32, 32, 6, 3),
  werewolf: monster("/sprites/werewolfsprite.png", 30, 26, 7, 3.4),
  scarecrow: monster("/sprites/scarecrow.png", 24, 48, 6, 2.8),
  ufo: monster("/sprites/ufo.png", 32, 26, 6, 2.8),
  shadowbeast: monster("/sprites/shadowbeast.png", 32, 32, 6, 3),
  swampthing: monster("/sprites/swampthing.png", 34, 58, 6, 2.4),
  candycorn: { url: "/sprites/candycornsprite.png", fw: 24, fh: 24, frames: 6, height: 0.5 },
  barrel: { url: "/royale/ui/chest.png", fw: 32, fh: 32, frames: 1, height: 1.35 },
  basket: { url: "/royale/ui/candybasket.png", fw: 32, fh: 32, frames: 1, height: 1 },
  lamp: { url: "/royale/ui/lamp.png", fw: 16, fh: 64, frames: 4, height: 3.6 },
  tree: { url: "/royale/ui/tree.png", fw: 128, fh: 128, frames: 1, height: 5.5 },
  grave: { url: "/royale/ui/grave.png", fw: 32, fh: 32, frames: 1, height: 1.5 },
  mausoleum: { url: "/royale/ui/mausoleum.png", fw: 80, fh: 116, frames: 1, height: 6 },
  blood: { url: "/sprites/blood.png", fw: 8, fh: 8, frames: 1, height: 0.25 },
} satisfies Record<string, SheetDef>;

type SheetId = keyof typeof SHEETS;
const ROAD_URL = "/sprites/gamebg.png";
const SKY_URL = "/ageofween/background.webp";

// Monster colours for death bursts.
const GORE: Partial<Record<MonsterId, string>> = {
  rat: "#9a8a9c", skull: "#f2efe6", imp: "#e0463a", pumpkin: "#ff8a1f", zombie: "#6fbf4a", ghost: "#cfe8ff",
  candle: "#ffd36a", werewolf: "#8a6a4a", scarecrow: "#d6b25a", ufo: "#6ae0ff", shadowbeast: "#8a4ad6", swampthing: "#4a9a5a",
};

export interface Assets {
  sheets: Record<SheetId, HTMLImageElement>;
  road: HTMLImageElement;
  sky: HTMLImageElement;
}

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
    const ids = Object.keys(SHEETS) as SheetId[];
    const [road, sky, ...imgs] = await Promise.all([loadImage(ROAD_URL), loadImage(SKY_URL), ...ids.map((id) => loadImage(SHEETS[id].url))]);
    const sheets = Object.fromEntries(ids.map((id, i) => [id, imgs[i]])) as Record<SheetId, HTMLImageElement>;
    // Fonts are drawn on the canvas, so wait for them rather than flash a fallback.
    await Promise.all(
      [document.fonts?.load("700 20px Pixelify"), document.fonts?.load("20px CCDigits", "0123456789")].map((p) => p?.catch(() => undefined))
    );
    return { sheets, road, sky };
  })();
  return assetsPromise;
}

// ---------- camera ----------

const CAM_BACK = 6.5;
const FAR = 62;
const FOG = "#150d22";
// Chunky Press Start 2P digits (Pixelify's 9 reads as an S), Pixelify for letters.
const FONT = "CCDigits, Pixelify, monospace";

interface Camera {
  w: number;
  h: number;
  cx: number;
  horizon: number;
  focal: number;
  camH: number;
  camZ: number;
  camX: number;
  // Pixels per world unit at the army.
  unit: number;
}

interface Projected {
  x: number;
  y: number;
  s: number;
  dz: number;
}

function project(cam: Camera, x: number, y: number, z: number): Projected | null {
  const dz = z - cam.camZ;
  if (dz < 0.6) return null;
  const s = cam.focal / dz;
  return { x: cam.cx + (x - cam.camX) * s, y: cam.horizon + (cam.camH - y) * s, s, dz };
}

// Things far down the road fade out of the fog instead of popping in.
function fogAlpha(dz: number) {
  return Math.max(0, Math.min(1, (FAR - dz) / 12));
}

// ---------- effects ----------

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
  blood?: boolean;
}

interface Floater {
  // Rides along with the army instead of staying where it spawned.
  follow?: boolean;
  text: string;
  color: string;
  x: number;
  y: number;
  z: number;
  life: number;
  max: number;
  size: number;
}

// ---------- the renderer ----------

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private cam!: Camera;
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  // When each visible soldier appeared, for their pop-in.
  private born: number[] = [];
  private shake = 0;
  private lastZ = 0;
  private flash = 0;
  private flashColor = "#fff";

  constructor(private canvas: HTMLCanvasElement, private assets: Assets) {
    this.ctx = canvas.getContext("2d")!;
  }

  resize(width: number, height: number, dpr: number) {
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // Squad-relative soldier spots: a sunflower spiral, packed toward the front.
  private soldierSpot(i: number) {
    const a = i * 2.39996;
    const d = SOLDIER_SPACING * Math.sqrt(i + 0.3);
    return { ox: Math.cos(a) * d, oz: Math.sin(a) * d * 0.75 };
  }

  private visibleSoldiers(army: number) {
    return Math.min(army, MAX_VISIBLE_SOLDIERS);
  }

  handleEvents(state: GameState, events: GameEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case "hit":
          for (let i = 0; i < 2; i++) this.spark(e.x, e.y, e.z, "#ffe28a", 3, 0.25);
          break;
        case "kill": {
          const color = GORE[e.enemy.type] ?? "#fff";
          const n = e.enemy.boss ? 60 : 12;
          for (let i = 0; i < n; i++) this.spark(e.enemy.x, e.enemy.boss ? 2 : 0.6, e.enemy.z, color, e.enemy.boss ? 9 : 5, 0.7);
          if (e.enemy.boss) {
            this.shake = 0.6;
            this.flash = 0.5;
            this.flashColor = "#ffcf4a";
          }
          break;
        }
        case "gate": {
          const g = e.gate;
          const diff = e.after - e.before;
          const good = g.kind === "fire" ? g.value >= 0 : diff >= 0;
          const text = g.kind === "fire" ? `${g.value >= 0 ? "+" : ""}${Math.floor(g.value)}% FIRE` : `${diff >= 0 ? "+" : ""}${diff}`;
          this.floaters.push({ follow: true, text, color: good ? "#7dffb0" : "#ff5a6a", x: state.x, y: 2.6, z: state.z + 2, life: 1.2, max: 1.2, size: 1.1 });
          this.flash = 0.25;
          this.flashColor = good ? "#6ae0ff" : "#ff2d55";
          break;
        }
        case "barrel": {
          const b = e.barrel;
          for (let i = 0; i < 18; i++) this.spark(b.x, 0.7, b.z, i % 2 ? "#3aa06a" : "#ffcf4a", 6, 0.6);
          const text = b.reward.kind === "add" ? `+${b.reward.amount}` : `+${b.reward.amount}% FIRE`;
          this.floaters.push({ text, color: "#ffcf4a", x: b.x, y: 1.8, z: b.z, life: 1.1, max: 1.1, size: 0.9 });
          break;
        }
        case "barrelCrash":
          for (let i = 0; i < 10; i++) this.spark(e.barrel.x, 0.6, e.barrel.z, "#3aa06a", 5, 0.5);
          this.bleed(state, e.lost);
          this.shake = Math.max(this.shake, 0.25);
          break;
        case "bite":
          this.bleed(state, e.lost);
          this.shake = Math.max(this.shake, e.enemy.boss ? 0.15 : 0.2);
          if (!e.enemy.boss) {
            for (let i = 0; i < 8; i++) this.spark(e.enemy.x, 0.6, e.enemy.z, GORE[e.enemy.type] ?? "#fff", 4, 0.5);
            if (e.lost) this.floaters.push({ text: `-${e.lost}`, color: "#ff5a6a", x: e.enemy.x, y: 1.6, z: e.enemy.z, life: 0.9, max: 0.9, size: 0.8 });
          }
          break;
        case "boss":
          this.shake = 0.3;
          break;
        case "level":
          this.flash = 0.4;
          this.flashColor = "#ffcf4a";
          break;
      }
    }
  }

  private spark(x: number, y: number, z: number, color: string, speed: number, life: number) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.6);
    this.particles.push({ x, y, z, vx: Math.cos(a) * v, vy: 2 + Math.random() * speed, vz: Math.sin(a) * v * 0.6, life, max: life, color, size: 0.12 + Math.random() * 0.1 });
  }

  // Soldiers lost: pop that many from the back of the formation in blood.
  private bleed(state: GameState, lost: number) {
    const shown = Math.min(lost, 20);
    const visible = this.visibleSoldiers(state.army + lost);
    for (let k = 0; k < shown; k++) {
      const i = Math.max(0, visible - 1 - k);
      const { ox, oz } = this.soldierSpot(i);
      for (let j = 0; j < 3; j++) {
        this.particles.push({
          x: state.x + ox, y: 0.5, z: state.z + oz,
          vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 3, vz: (Math.random() - 0.5) * 3,
          life: 0.6, max: 0.6, color: "#c0182a", size: 0.09, blood: true,
        });
      }
    }
  }

  private updateEffects(state: GameState, dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 14 * dt;
      if (p.y < 0.02) {
        p.y = 0.02;
        p.vy *= -0.3;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 500) this.particles.splice(0, this.particles.length - 500);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y += dt * 1.5;
      if (f.follow) f.z += state.z - this.lastZ;
    }
    this.lastZ = state.z;
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt);
    this.flash = Math.max(0, this.flash - dt);
  }

  draw(state: GameState, dt: number, width: number, height: number) {
    this.updateEffects(state, dt);
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;

    const unit = width * 0.094;
    const horizon = height * 0.3;
    const playerY = height * 0.8;
    const shake = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 14 : 0;
    this.cam = {
      w: width,
      h: height,
      cx: width / 2 + shake,
      horizon,
      focal: unit * CAM_BACK,
      camH: (playerY - horizon) / unit,
      camZ: state.z - CAM_BACK,
      camX: state.x * 0.35,
      unit,
    };

    this.drawSky();
    this.drawGround(state);

    // Everything that stands on the road, far to near.
    type Item = { z: number; draw: () => void };
    const items: Item[] = [];
    this.collectScenery(items);
    for (const g of state.gates) items.push({ z: g.z, draw: () => this.drawGate(g) });
    for (const b of state.barrels) items.push({ z: b.z, draw: () => this.drawBarrel(b) });
    for (const e of state.enemies) items.push({ z: e.z, draw: () => this.drawEnemy(state, e) });
    this.collectSoldiers(state, items);
    for (const b of state.bullets) items.push({ z: b.z, draw: () => this.drawSprite("candycorn", b.x, 0.45, b.z, Math.floor(state.t * 18 + b.z0) % 6) });
    for (const p of this.particles) items.push({ z: p.z, draw: () => this.drawParticle(p) });
    items.sort((a, b) => b.z - a.z);
    for (const item of items) item.draw();

    this.drawArmyBadge(state);
    for (const f of this.floaters) this.drawFloater(f);

    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.35, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
    }
    // Darken the edges so the road reads as the focus.
    const vignette = ctx.createRadialGradient(width / 2, height * 0.6, height * 0.3, width / 2, height * 0.6, height * 0.85);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(5,2,10,0.55)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  private drawSky() {
    const { ctx, cam } = this;
    const { sky } = this.assets;
    ctx.fillStyle = FOG;
    ctx.fillRect(0, 0, cam.w, cam.horizon + 2);
    // The Age of Ween graveyard as a backdrop, cropped to the band above the road.
    const bandH = cam.horizon + cam.h * 0.06;
    const scale = Math.max((cam.w * 1.3) / sky.width, bandH / (sky.height * 0.8));
    const w = sky.width * scale;
    const h = sky.height * scale;
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(sky, (cam.w - w) / 2 - cam.camX * 6, bandH - h * 0.92, w, h);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    const fade = ctx.createLinearGradient(0, 0, 0, cam.horizon);
    fade.addColorStop(0, "rgba(21,13,34,0.35)");
    fade.addColorStop(0.75, "rgba(21,13,34,0.45)");
    fade.addColorStop(1, FOG);
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, cam.w, cam.horizon + 1);
  }

  private drawGround(state: GameState) {
    const { ctx, cam } = this;
    const road = this.assets.road;
    const texPerUnit = road.width / (ROAD_HALF * 2);
    for (let y = Math.ceil(cam.horizon) + 1; y < cam.h; y++) {
      const s = (y - cam.horizon) / cam.camH;
      const z = cam.camZ + cam.focal / s;
      const band = Math.floor(z / 2.5) & 1;
      ctx.fillStyle = band ? "#1d1428" : "#181021";
      ctx.fillRect(0, y, cam.w, 1);
      const left = cam.cx + (-ROAD_HALF - cam.camX) * s;
      const v = (((z * texPerUnit) % road.height) + road.height) % road.height;
      ctx.drawImage(road, 0, Math.floor(v), road.width, 1, left, y, ROAD_HALF * 2 * s, 1);
      // Curbs, striped so the speed reads
      const curb = 0.3 * s;
      ctx.fillStyle = Math.floor(z / 1.5) & 1 ? "#ff8a1f" : "#3a2446";
      ctx.fillRect(left - curb, y, curb, 1);
      ctx.fillRect(left + ROAD_HALF * 2 * s, y, curb, 1);
    }
    // Fog where the road meets the sky
    const fogH = cam.h * 0.2;
    const fog = ctx.createLinearGradient(0, cam.horizon, 0, cam.horizon + fogH);
    fog.addColorStop(0, FOG);
    fog.addColorStop(1, "rgba(21,13,34,0)");
    ctx.fillStyle = fog;
    ctx.fillRect(0, cam.horizon, cam.w, fogH);
    // A warm glow around the army
    const p = project(cam, state.x, 0, state.z);
    if (p) {
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, cam.unit * 4);
      glow.addColorStop(0, "rgba(255,138,31,0.18)");
      glow.addColorStop(1, "rgba(255,138,31,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - cam.unit * 4, p.y - cam.unit * 4, cam.unit * 8, cam.unit * 8);
    }
  }

  // Graves, trees and lamps line the road, placed from a hash of their
  // spot so they stay put as you run past.
  private collectScenery(items: { z: number; draw: () => void }[]) {
    const { cam } = this;
    const SPACING = 3.2;
    const first = Math.floor(cam.camZ / SPACING) + 1;
    const last = Math.floor((cam.camZ + FAR) / SPACING);
    for (let k = first; k <= last; k++) {
      for (const side of [-1, 1]) {
        const h = hash(k * 2 + (side > 0 ? 1 : 0));
        const z = k * SPACING + h * 1.2;
        if (k % 4 === 0) {
          items.push({ z, draw: () => this.drawLamp(side * (ROAD_HALF + 0.7), z, k) });
          continue;
        }
        const x = side * (ROAD_HALF + 1.6 + h * 3);
        const kind: SheetId | null = h < 0.3 ? "tree" : h < 0.75 ? "grave" : h < 0.8 ? "mausoleum" : null;
        if (kind) items.push({ z, draw: () => this.drawSprite(kind, x, 0, z, 0, side > 0 && kind === "tree") });
      }
    }
  }

  private drawLamp(x: number, z: number, k: number) {
    const p = project(this.cam, x, 3.2, z);
    if (p) {
      const { ctx } = this;
      const r = p.s * 2.2;
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      glow.addColorStop(0, `rgba(255,207,74,${0.35 * fogAlpha(p.dz)})`);
      glow.addColorStop(1, "rgba(255,207,74,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    }
    this.drawSprite("lamp", x, 0, z, Math.floor(performance.now() / 180 + k) % 4);
  }

  // Draws a sheet frame standing at (x, y, z), scaled by depth.
  private drawSprite(id: SheetId, x: number, y: number, z: number, frame = 0, flip = false, sizeMul = 1, flash = 0) {
    const def: SheetDef = SHEETS[id];
    const p = project(this.cam, x, y, z);
    if (!p) return null;
    const alpha = fogAlpha(p.dz);
    if (alpha <= 0) return null;
    const h = def.height * sizeMul * p.s;
    const w = (h * def.fw) / def.fh;
    const { ctx } = this;
    const img = this.assets.sheets[id];
    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(p.x, p.y);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(img, (frame % def.frames) * def.fw, 0, def.fw, def.fh, -w / 2, -h, w, h);
    if (flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * flash;
      ctx.drawImage(img, (frame % def.frames) * def.fw, 0, def.fw, def.fh, -w / 2, -h, w, h);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    return { x: p.x, top: p.y - h, bottom: p.y, w, h, s: p.s, alpha };
  }

  private drawShadow(x: number, z: number, radius: number) {
    const p = project(this.cam, x, 0, z);
    if (!p) return;
    const { ctx } = this;
    ctx.globalAlpha = 0.4 * fogAlpha(p.dz);
    ctx.fillStyle = "#05020a";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * p.s, radius * p.s * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private text(str: string, x: number, y: number, size: number, color: string, alpha = 1) {
    const { ctx } = this;
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size * 0.22);
    ctx.strokeStyle = "#140a1c";
    ctx.strokeText(str, x, y);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  private drawGate(g: Gate) {
    const { ctx, cam } = this;
    const bottomL = project(cam, g.x0, 0, g.z);
    const topR = project(cam, g.x1, 2.6, g.z);
    if (!bottomL || !topR) return;
    const alpha = fogAlpha(bottomL.dz) * (g.used && !g.chosen ? 0.35 : 1);
    if (alpha <= 0) return;
    const left = bottomL.x;
    const right = topR.x;
    const top = topR.y;
    const bottom = bottomL.y;
    const s = bottomL.s;

    const good = g.kind === "mul" || g.value > 0;
    const [fill, edge] =
      g.kind === "mul" ? ["rgba(255,207,74,0.34)", "#ffcf4a"] : g.kind === "fire" ? (good ? ["rgba(255,138,31,0.32)", "#ff8a1f"] : ["rgba(255,45,85,0.32)", "#ff2d55"]) : good ? ["rgba(60,170,255,0.32)", "#6ae0ff"] : ["rgba(255,45,85,0.32)", "#ff2d55"];

    ctx.globalAlpha = alpha;
    const grad = ctx.createLinearGradient(0, top, 0, bottom);
    grad.addColorStop(0, fill.replace(/[\d.]+\)$/, "0.55)"));
    grad.addColorStop(1, fill);
    ctx.fillStyle = grad;
    ctx.fillRect(left, top, right - left, bottom - top);
    if (g.hitT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${g.hitT * 2})`;
      ctx.fillRect(left, top, right - left, bottom - top);
    }
    // Stone posts and a lintel
    const post = Math.max(2, 0.28 * s);
    ctx.fillStyle = "#4a3a5a";
    ctx.fillRect(left - post / 2, top - post, post, bottom - top + post);
    ctx.fillRect(right - post / 2, top - post, post, bottom - top + post);
    ctx.fillStyle = edge;
    ctx.fillRect(left, top - post * 0.9, right - left, post * 0.7);
    ctx.globalAlpha = 1;

    const v = Math.floor(g.value);
    const label = g.kind === "mul" ? `x${v}` : g.kind === "fire" ? `${v >= 0 ? "+" : ""}${v}%` : `${v >= 0 ? "+" : ""}${v}`;
    const size = Math.max(10, s * 1.05);
    const mid = (left + right) / 2;
    const cy = top + (bottom - top) * (g.kind === "fire" ? 0.38 : 0.45);
    this.text(label, mid, cy, size * (g.hitT > 0 ? 1.12 : 1), "#ffffff", alpha);
    if (g.kind === "fire") this.text("FIRE RATE", mid, cy + size * 0.85, size * 0.42, "#ffcf4a", alpha);
    else if (g.kind === "add") this.text("HEROES", mid, cy + size * 0.8, size * 0.36, good ? "#bfefff" : "#ffc0c8", alpha);
  }

  private drawBarrel(b: Barrel) {
    this.drawShadow(b.x, b.z, 0.7);
    const r = this.drawSprite("barrel", b.x, 0, b.z, 0, false, 1, b.hitT > 0 ? 0.6 : 0);
    if (!r) return;
    const size = Math.max(9, r.s * 0.6);
    this.text(String(Math.ceil(b.hp)), r.x, r.top - size * 0.5, size, "#ffffff", r.alpha);
    const reward = b.reward.kind === "add" ? `+${b.reward.amount}` : `+${b.reward.amount}%`;
    const color = b.reward.kind === "add" ? "#7dffb0" : "#ffb04a";
    this.text(reward, r.x, r.top + r.h * 0.55, size * 0.8, color, r.alpha);
  }

  private drawEnemy(state: GameState, e: Enemy) {
    const stats = MONSTERS[e.type];
    const mul = e.boss ? 2.6 : 1;
    this.drawShadow(e.x, e.z, stats.radius * mul);
    const def: SheetDef = SHEETS[e.type];
    const frame = Math.floor(state.t * (e.boss ? 7 : 10) + e.id) % def.frames;
    // The sheets face right; face the army.
    const flip = e.x > state.x + 0.3;
    const bob = e.type === "skull" || e.type === "ghost" || e.type === "ufo" ? 0.35 + Math.sin(state.t * 4 + e.id) * 0.12 : 0;
    const lunge = e.chewing ? Math.abs(Math.sin(state.t * 10)) * 0.25 : 0;
    const r = this.drawSprite(e.type, e.x, bob + lunge, e.z, frame, flip, mul, e.hitT > 0 ? 0.7 : 0);
    if (!r) return;
    const size = Math.max(e.boss ? 14 : 9, r.s * (e.boss ? 0.9 : 0.55));
    this.text(String(Math.ceil(e.hp)), r.x, r.top - size * 0.6, size, e.boss ? "#ffcf4a" : "#ffffff", r.alpha);
  }

  private collectSoldiers(state: GameState, items: { z: number; draw: () => void }[]) {
    const n = this.visibleSoldiers(state.army);
    const now = state.t;
    if (this.born.length > n) this.born.length = n;
    while (this.born.length < n) this.born.push(now);
    const running = !state.halted && !state.over;
    for (let i = 0; i < n; i++) {
      const { ox, oz } = this.soldierSpot(i);
      const x = state.x + ox;
      const z = state.z + oz;
      const hero = HEROES[i % HEROES.length];
      const age = now - this.born[i];
      const pop = age < 0.25 ? 0.4 + (age / 0.25) * 0.6 + Math.sin((age / 0.25) * Math.PI) * 0.35 : 1;
      const hop = running ? Math.abs(Math.sin(now * 13 + i * 1.7)) * 0.14 : 0;
      const frame = Math.floor(now * 9 + i * 0.37);
      items.push({
        z,
        draw: () => {
          this.drawShadow(x, z, 0.3);
          this.drawSprite(hero, x, hop, z, frame, i % 3 === 1, pop);
        },
      });
    }
  }

  private drawArmyBadge(state: GameState) {
    const r = squadRadius(state.army);
    const p = project(this.cam, state.x, 1.55 + r * 0.4, state.z + r * 0.75);
    if (!p) return;
    const { ctx } = this;
    const size = Math.max(14, this.cam.unit * 0.55);
    const label = String(state.army);
    ctx.font = `700 ${Math.round(size)}px ${FONT}`;
    const w = ctx.measureText(label).width + size * 1.1;
    const h = size * 1.35;
    ctx.fillStyle = "#140a1c";
    roundRect(ctx, p.x - w / 2, p.y - h / 2 + 3, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = "#2f7de0";
    roundRect(ctx, p.x - w / 2, p.y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRect(ctx, p.x - w / 2 + 3, p.y - h / 2 + 2, w - 6, h * 0.35, h / 4);
    ctx.fill();
    this.text(label, p.x, p.y + 1, size, "#ffffff");
  }

  private drawParticle(p: Particle) {
    const q = project(this.cam, p.x, p.y, p.z);
    if (!q) return;
    const { ctx } = this;
    const size = Math.max(1.5, p.size * q.s);
    ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5) * fogAlpha(q.dz);
    if (p.blood) {
      ctx.drawImage(this.assets.sheets.blood, q.x - size, q.y - size, size * 2, size * 2);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  private drawFloater(f: Floater) {
    const p = project(this.cam, f.x, f.y, f.z);
    if (!p) return;
    const t = 1 - f.life / f.max;
    const grow = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t - 0.15) * 0.5);
    const size = Math.min(this.cam.unit * 0.9, Math.max(14, f.size * p.s));
    this.text(f.text, p.x, p.y, size * grow, f.color, Math.min(1, (f.life / f.max) * 2.5));
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
