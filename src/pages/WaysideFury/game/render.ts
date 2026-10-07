// The renderer only reads simulation state; all art is native-resolution pixel art.
import { HEIGHT, WIDTH, activeHero, type Effect, type Enemy, type GameState, type HeroId, type Projectile } from "./sim";

interface Sheet { url: string; w: number; h: number; frames: number }
const SHEETS = {
  joe: { url: "/royale/joe_idle.png", w: 16, h: 24, frames: 6 },
  matt: { url: "/royale/matt_idle.png", w: 16, h: 24, frames: 6 },
  alex: { url: "/royale/ui/alex_idle.png", w: 16, h: 24, frames: 6 },
  jon: { url: "/royale/ui/jon_idle.png", w: 16, h: 24, frames: 5 },
  run_joe: { url: "/mystery-crypt/run_joe.png", w: 16, h: 24, frames: 4 },
  run_matt: { url: "/mystery-crypt/run_matt.png", w: 16, h: 24, frames: 4 },
  zombie: { url: "/sprites/zombiesprite-1.png", w: 16, h: 24, frames: 6 },
  pumpkin: { url: "/sprites/pumpkin.png", w: 16, h: 16, frames: 6 },
  ghost: { url: "/sprites/ghost.png", w: 16, h: 32, frames: 6 },
  imp: { url: "/sprites/imp.png", w: 16, h: 16, frames: 4 },
  shadowbeast: { url: "/sprites/shadowbeast.png", w: 32, h: 32, frames: 6 },
} satisfies Record<string, Sheet>;
type SpriteId = keyof typeof SHEETS;
const ACCENT: Record<HeroId, string> = { joe: "#79ebff", matt: "#ffd06f" };
const INK = "#101722";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<SpriteId, HTMLImageElement>();

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    this.ctx = canvas.getContext("2d")!;
    for (const [id, sheet] of Object.entries(SHEETS)) {
      const image = new Image();
      image.src = sheet.url;
      this.images.set(id as SpriteId, image);
    }
  }

  draw(s: GameState) {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.save();
    // A repeatable one-pixel shake preserves the crisp internal grid.
    if (s.hitStop > 0) c.translate(Math.sin(s.time * 93) > 0 ? 1 : -1, 0);
    this.drawGround(s);
    for (const effect of s.effects) if (effect.kind === "dash" || effect.kind === "charge") this.effect(effect);
    const actors = [
      { y: s.y, draw: () => this.hero(s) },
      ...s.enemies.filter((enemy) => enemy.hp > 0).map((enemy) => ({ y: enemy.y, draw: () => this.enemy(s, enemy) })),
    ];
    actors.sort((a, b) => a.y - b.y);
    for (const actor of actors) actor.draw();
    for (const shot of s.projectiles) this.projectile(shot, s.time);
    for (const effect of s.effects) if (effect.kind !== "dash" && effect.kind !== "charge") this.effect(effect);
    for (const floater of s.floaters) {
      c.globalAlpha = Math.min(1, floater.ttl * 3);
      this.text(floater.text, floater.x, floater.y, floater.color, 9);
      c.globalAlpha = 1;
    }
    if (s.scene === "test") this.text("WAYSIDE TRAINING YARD", 160, 174, "#91ada2", 7);
    c.restore();
  }

  private rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  private text(text: string, x: number, y: number, color: string, size = 8) {
    const c = this.ctx;
    c.font = `bold ${size}px monospace`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.lineWidth = 3;
    c.strokeStyle = INK;
    c.strokeText(text, Math.round(x), Math.round(y));
    c.fillStyle = color;
    c.fillText(text, Math.round(x), Math.round(y));
  }

  private drawGround(s: GameState) {
    if (s.scene === "dungeon" || s.scene === "realm") {
      this.drawDungeonGround(s);
      return;
    }
    this.drawYard(s.time);
  }

  private drawYard(time: number) {
    this.rect(0, 0, WIDTH, HEIGHT, "#172a2c");
    // Distant trees, garden wall, and the warm lamps of Wayside.
    this.rect(0, 24, WIDTH, 17, "#213938");
    for (let x = -4; x < WIDTH; x += 24) {
      this.rect(x + 6, 27 + (x % 3), 4, 14, "#162b2c");
      this.rect(x, 28, 18, 7, "#2c4940");
      this.rect(x + 4, 25, 12, 6, "#2c4940");
    }
    this.rect(0, 38, WIDTH, 10, "#40524b");
    this.rect(0, 38, WIDTH, 2, "#6a7461");
    for (let x = 0; x < WIDTH; x += 16) {
      this.rect(x, 40, 1, 6, "#2f403e");
      this.rect(x + 8, 46, 1, 3, "#2f403e");
    }
    this.rect(17, 48, 286, 116, "#354747");
    for (let y = 48; y < 164; y += 16) for (let x = 17; x < 303; x += 16) {
      const n = Math.abs((x * 17 + y * 31) % 19);
      this.rect(x + 1, y + 1, 14, Math.min(14, 163 - y), n < 8 ? "#3b504c" : "#40544e");
      this.rect(x + 2, y + 2, 12, 1, "#4b6055");
      if (n < 3) {
        this.rect(x + 2, y + 10, 4, 2, "#597459");
        this.rect(x + 4, y + 8, 2, 3, "#597459");
      }
      if (n > 15) this.rect(x + 8, y + 6, 2, 1, "#334743");
    }
    // Grass borders stay outside the playable corridor.
    for (const x of [0, 304]) {
      this.rect(x, 47, 16, 119, "#2b4538");
      for (let y = 52; y < 162; y += 11) {
        this.rect(x + 3, y, 2, 4, "#50714a");
        this.rect(x + 11, y + 4, 1, 3, "#638155");
      }
    }
    for (const x of [9, 311]) this.lamp(x, 44, time);
    this.rect(0, 164, WIDTH, 16, "#233837");
    this.rect(0, 164, WIDTH, 2, "#6c7460");
    for (let x = 0; x < WIDTH; x += 20) {
      this.rect(x, 166, 1, 14, "#152b2b");
      this.rect(x + 2, 167, 16, 1, "#40524b");
    }
    this.rect(0, 0, WIDTH, 24, INK);
  }

  private drawDungeonGround(s: GameState) {
    const realm = s.scene === "realm";
    this.rect(0, 0, WIDTH, HEIGHT, realm ? "#101020" : "#171c27");
    for (let y = 30; y < HEIGHT; y += 16) for (let x = 0; x < WIDTH; x += 16) {
      const n = (x * 7 + y * 11 + s.room * 3) % 13;
      this.rect(x + 1, y + 1, 14, 14, realm ? (n < 6 ? "#302048" : "#201838") : n < 6 ? "#353340" : "#302e3a");
      this.rect(x + 2, y + 2, 11, 1, realm ? "#604080" : "#45414c");
      if (n < 3) this.rect(x + 10, y + 8, 3, 2, realm ? "#a04080" : "#5a4b48");
    }
    this.rect(0, 26, WIDTH, 16, realm ? "#604080" : "#62575b");
    this.rect(0, 42, WIDTH, 5, realm ? "#201030" : "#272735");
    for (let x = 0; x < WIDTH; x += 20) this.rect(x, 28, 1, 12, realm ? "#302048" : "#383442");
    for (const x of [5, 309]) {
      this.rect(x, 48, 6, 114, realm ? "#503060" : "#534652");
      for (let y = 55; y < 164; y += 16) this.rect(x, y, 6, 2, realm ? "#a060a0" : "#716067");
    }
    this.rect(0, 164, WIDTH, 16, realm ? "#302048" : "#322d3c");
    this.rect(0, 164, WIDTH, 2, realm ? "#8060a0" : "#62575b");
    this.lamp(20, 40, s.time, realm ? "#ff80c0" : "#ff9d66");
    this.lamp(300, 40, s.time, realm ? "#ff80c0" : "#ff9d66");
    this.rect(0, 0, WIDTH, 24, INK);
  }

  private lamp(x: number, y: number, time: number, color = "#f1cf88") {
    const c = this.ctx;
    c.globalAlpha = 0.07 + Math.sin(time * 3 + x) * 0.02;
    this.disc(x, y - 9, 14, color);
    c.globalAlpha = 1;
    this.rect(x - 2, y - 15, 4, 14, "#17292d");
    this.rect(x - 4, y - 15, 8, 7, "#6e6653");
    this.rect(x - 2, y - 14, 4, 5, color);
    this.rect(x - 5, y - 17, 10, 2, "#273536");
    this.rect(x - 4, y - 2, 8, 3, "#283936");
  }

  private disc(x: number, y: number, radius: number, color: string) {
    // A stepped circle has the same pixel language as the sprite sheets.
    for (let dy = -Math.ceil(radius); dy <= radius; dy += 2) {
      const half = Math.sqrt(Math.max(0, radius * radius - dy * dy));
      this.rect(x - half, y + dy, half * 2, 2, color);
    }
  }

  private shadow(x: number, y: number, width = 14) {
    this.ctx.globalAlpha = 0.42;
    this.rect(x - width / 2, y - 3, width, 4, "#101b24");
    this.rect(x - width / 2 + 2, y - 4, width - 4, 6, "#101b24");
    this.ctx.globalAlpha = 1;
  }

  private sprite(id: SpriteId, x: number, y: number, time: number, flip = false, scale = 1, hit = false) {
    const c = this.ctx;
    const sheet = SHEETS[id];
    const image = this.images.get(id)!;
    const frame = Math.floor(time * (id.startsWith("run_") ? 10 : 6)) % sheet.frames;
    if (!image.complete || !image.naturalWidth) return;
    c.save();
    c.translate(Math.round(x), Math.round(y));
    if (flip) c.scale(-1, 1);
    c.drawImage(image, frame * sheet.w, 0, sheet.w, sheet.h, -sheet.w * scale / 2, -sheet.h * scale, sheet.w * scale, sheet.h * scale);
    if (hit) {
      c.globalCompositeOperation = "lighter";
      c.globalAlpha *= 0.8;
      c.drawImage(image, frame * sheet.w, 0, sheet.w, sheet.h, -sheet.w * scale / 2, -sheet.h * scale, sheet.w * scale, sheet.h * scale);
    }
    c.restore();
  }

  private hero(s: GameState) {
    const c = this.ctx;
    const hero = activeHero(s);
    const color = ACCENT[s.active];
    if (s.charge > 0.12) {
      c.globalAlpha = 0.12 + Math.sin(s.time * 23) * 0.04;
      this.disc(s.x, s.y - 11, 12 + Math.min(8, s.charge * 5), color);
      c.globalAlpha = 1;
      for (let k = 0; k < 5; k++) {
        const a = s.time * 6 + k * 1.26;
        this.rect(s.x + Math.cos(a) * 13, s.y - 11 + Math.sin(a) * 15, 2, 3, color);
      }
    }
    this.shadow(s.x, s.y);
    // Cyan/gold foot markers remain visible underneath hit flashes.
    this.rect(s.x - 5, s.y + 1, 10, 1, color);
    c.globalAlpha = hero.invulnerable > 0 && Math.floor(s.time * 20) % 2 === 0 ? 0.52 : 1;
    this.sprite(s.moving || s.dashTimer > 0 ? `run_${s.active}` : s.active, s.x, s.y, s.time, s.faceX < 0, 1, s.hitStop > 0);
    c.globalAlpha = 1;
    if (s.guard) {
      const x = s.x + s.faceX * 9;
      const y = s.y - 12 + s.faceY * 7;
      c.globalAlpha = 0.6;
      this.rect(x - 5, y - 7, 10, 13, color);
      this.rect(x - 3, y + 6, 6, 3, color);
      c.globalAlpha = 1;
      this.rect(x - 3, y - 4, 6, 2, "#effbff");
      this.rect(x - 1, y - 5, 2, 8, "#effbff");
    }
  }

  private enemy(s: GameState, enemy: Enemy) {
    const boss = enemy.kind === "boss";
    const scale = boss ? 1.5 : 1;
    const sprite = enemy.kind === "shooter" ? "imp" : enemy.sprite;
    this.shadow(enemy.x, enemy.y, boss ? 34 : 13);
    if (enemy.windup > 0) {
      this.ctx.globalAlpha = 0.35 + Math.sin(s.time * 22) * 0.12;
      this.disc(enemy.x, enemy.y - 2, boss ? 24 : 12, enemy.phase === 2 ? "#dd669a" : "#fba578");
      this.ctx.globalAlpha = 1;
      this.text("!", enemy.x, enemy.y - (boss ? 53 : 30), "#ffd796", 11);
    }
    this.sprite(sprite, enemy.x, enemy.y, s.time + enemy.id * 0.17, enemy.x > s.x, scale, enemy.hitTimer > 0);
    if (enemy.hp < enemy.maxHp || boss) {
      const width = boss ? 48 : 18;
      const top = enemy.y - SHEETS[sprite].h * scale - 6;
      this.rect(enemy.x - width / 2 - 1, top - 1, width + 2, 4, INK);
      this.rect(enemy.x - width / 2, top, width, 2, "#613448");
      this.rect(enemy.x - width / 2, top, width * enemy.hp / enemy.maxHp, 2, boss ? "#ef87bc" : "#f19b77");
    }
  }

  private projectile(shot: Projectile, time: number) {
    const color = shot.owner === "enemy" ? "#f18c9d" : ACCENT[shot.hero ?? "joe"];
    if (shot.beam) {
      const length = Math.hypot(shot.vx, shot.vy) || 1;
      const dx = shot.vx / length;
      const dy = shot.vy / length;
      this.ctx.globalAlpha = 0.3;
      for (let k = 0; k < 7; k++) this.disc(shot.x - dx * k * 5, shot.y - dy * k * 5 - 9, Math.max(2, shot.radius - k * 0.4), color);
      this.ctx.globalAlpha = 1;
      this.disc(shot.x, shot.y - 9, shot.radius, color);
      this.disc(shot.x, shot.y - 9, Math.max(2, shot.radius - 2), "#fff8de");
    } else {
      const norm = Math.hypot(shot.vx, shot.vy) || 1;
      this.ctx.globalAlpha = 0.4;
      this.rect(shot.x - shot.vx / norm * 6 - 2, shot.y - shot.vy / norm * 6 - 11, 4, 4, color);
      this.ctx.globalAlpha = 1;
      this.disc(shot.x, shot.y - 9, shot.radius + Math.sin(time * 30) * 0.4, color);
      this.rect(shot.x - 1, shot.y - 10, 2, 2, "#fff8e6");
    }
  }

  private effect(effect: Effect) {
    const c = this.ctx;
    const color = ACCENT[effect.hero ?? "joe"];
    const life = Math.max(0, effect.ttl / effect.maxT);
    const progress = 1 - life;
    c.save();
    if (effect.kind === "slash") {
      const angle = Math.atan2(effect.dy, effect.dx);
      const radius = effect.size * (0.7 + progress * 0.3);
      c.globalAlpha = Math.min(1, life * 2);
      for (let k = 0; k <= 12; k++) {
        const a = angle - 1.1 + k / 12 * 2.2;
        const x = effect.x + Math.cos(a) * radius;
        const y = effect.y - 11 + Math.sin(a) * radius;
        this.rect(x, y, k === 6 ? 4 : 3, 3, k > 2 && k < 10 ? "#fff3d2" : color);
        if (k % 2 === 0) this.rect(effect.x + Math.cos(a) * (radius - 4), effect.y - 11 + Math.sin(a) * (radius - 4), 2, 2, color);
      }
    } else if (effect.kind === "dash") {
      c.globalAlpha = life * 0.38;
      this.sprite(effect.hero ?? "joe", effect.x, effect.y, 0, effect.dx < 0);
      for (let k = 0; k < 3; k++) this.rect(effect.x - effect.dx * (k * 5 + 5), effect.y - 7 - k * 4, 4, 1, color);
    } else if (effect.kind === "hit") {
      c.globalAlpha = life;
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3;
        this.rect(effect.x + Math.cos(a) * progress * 13, effect.y - 9 + Math.sin(a) * progress * 13, 2, 2, k % 2 ? color : "#fff8d4");
      }
    } else if (effect.kind === "level") {
      c.globalAlpha = life * 0.7;
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        this.rect(effect.x + Math.cos(a) * progress * 26, effect.y - 12 + Math.sin(a) * progress * 26, 3, 3, "#fbe79d");
      }
      this.text("LEVEL UP!", effect.x, effect.y - 34 - progress * 10, "#fff0b1", 10);
    } else if (effect.kind === "beam") {
      c.globalAlpha = life * 0.6;
      this.disc(effect.x, effect.y - 12, 17 * life, color);
      this.text(effect.hero === "matt" ? "GOLDEN FURY" : "WAYSIDE WAVE", effect.x, effect.y - 32, color, 7);
    } else {
      c.globalAlpha = life * 0.3;
      this.disc(effect.x, effect.y - 12, effect.size, color);
    }
    c.restore();
  }
}
