// The renderer only reads simulation state; all art is native-resolution pixel art.
import { HEIGHT, WIDTH, activeHero, type Effect, type Enemy, type GameState, type HeroId, type Projectile } from "./sim";

import { HUB_POINTS, LOCATIONS } from "./content";

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
    if (s.scene === "overworld") {
      this.taxi(s.x, s.y, s.faceX, s.faceY, s.time, s.moving);
      c.restore();
      return;
    }
    for (const effect of s.effects) if (effect.kind === "dash" || effect.kind === "charge") this.effect(effect);
    for (const enemy of s.enemies) this.bossTelegraph(s, enemy);
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
    if (s.scene === "dungeon" && s.room === 2) this.bossBar(s);
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
    if (s.scene === "overworld") { this.drawOverworld(s); return; }
    if (s.scene === "hub") { this.drawHub(s); return; }
    if (s.scene === "dungeon" || s.scene === "realm") {
      this.drawDungeonGround(s);
      return;
    }
    this.drawYard(s.time);
  }

  private drawOverworld(s: GameState) {
    this.rect(0, 24, WIDTH, HEIGHT - 24, "#21372f");
    for (let y = 30; y < 166; y += 12) for (let x = 6; x < WIDTH; x += 18) {
      const n = (x * 7 + y * 3) % 17;
      this.rect(x, y, 3, 1, n < 9 ? "#304b39" : "#385440");
      if (n < 5) this.rect(x + 1, y - 2, 1, 3, "#3c5941");
    }
    // A small river and a bridge make the atlas feel like a place.
    for (let x = 0; x < WIDTH; x += 12) {
      const y = 36 + Math.round(Math.sin(x * 0.03) * 7);
      this.rect(x, y, 12, 8, "#355458");
      this.rect(x, y + 2, 8, 1, "#4c6d6a");
    }
    this.road(61, 110, 111, 12, true);
    this.road(160, 75, 12, 47, false);
    this.road(160, 74, 98, 12, true);
    this.road(246, 74, 12, 76, false);
    this.road(139, 59, 12, 24, false);
    this.road(140, 74, 29, 12, true);
    for (const [x, y] of [[23, 72], [46, 47], [100, 65], [204, 56], [288, 62], [287, 137], [207, 151], [101, 149], [34, 150]]) this.tree(x, y);
    this.rect(151, 40, 28, 2, "#a0845c");
    this.rect(151, 47, 28, 2, "#a0845c");
    for (const location of LOCATIONS) {
      const { x, y } = location;
      if (location.locked) {
        this.rect(x - 10, y - 14, 20, 15, "#28212f");
        this.rect(x - 7, y - 18, 14, 5, "#413244");
        this.rect(x - 6, y - 11, 12, 1, "#a2678d");
        this.rect(x - 3, y - 8, 6, 5, "#bf83a1");
        this.rect(x - 2, y - 11, 4, 3, "#bf83a1");
        this.text(location.name.toUpperCase(), x, y + 12, "#a4a19f", 7);
        this.text("TAKEN OVER", x, y + 21, "#ae8296", 6);
      } else if (location.id === "wayside") {
        this.rect(x - 14, y - 17, 28, 18, "#977755");
        this.rect(x - 18, y - 22, 36, 6, "#8d5d50");
        this.rect(x - 13, y - 26, 26, 5, "#b3795b");
        this.rect(x - 3, y - 8, 6, 9, "#29373c");
        this.rect(x - 11, y - 12, 5, 5, "#ebc681");
        this.rect(x + 6, y - 12, 5, 5, "#ebc681");
        this.text("WAYSIDE", x, y + 12, "#ffe2a9", 8);
      } else {
        this.ctx.globalAlpha = 0.12;
        this.disc(x, y - 5, 23, "#f28996");
        this.ctx.globalAlpha = 1;
        this.rect(x - 14, y - 12, 28, 14, "#42323e");
        this.rect(x - 10, y - 17, 20, 5, "#684654");
        this.rect(x - 6, y - 13, 12, 10, "#bc6c75");
        this.rect(x - 3, y - 10, 6, 6, "#f0aa88");
        this.text("BLAST SITE", x, y + 12, "#ffd6b0", 8);
      }
      if (!location.locked) {
        this.rect(x - 2, y + 2, 4, 3, "#e7c88a");
        if (Math.hypot(s.x - x, s.y - y) < 24) this.text("INTERACT", x, y - 34, "#fff3cf", 7);
      }
    }
    this.rect(0, 166, WIDTH, 14, "#162b2b");
    this.text("CHAPTER 1  //  THE BLAST SITE", 160, 174, "#90a893", 7);
    this.rect(0, 0, WIDTH, 24, INK);
  }

  private road(x: number, y: number, w: number, h: number, horizontal: boolean) {
    this.rect(x - 2, y - 2, w + 4, h + 4, "#536054");
    this.rect(x, y, w, h, "#323e3e");
    for (let k = 4; k < (horizontal ? w : h); k += 14) {
      this.rect(horizontal ? x + k : x + w / 2, horizontal ? y + h / 2 : y + k, horizontal ? 6 : 1, horizontal ? 1 : 6, "#968a63");
    }
  }

  private tree(x: number, y: number) {
    this.shadow(x, y, 18);
    this.rect(x - 2, y - 10, 4, 11, "#584c3e");
    this.rect(x - 10, y - 20, 20, 12, "#182e2d");
    this.rect(x - 7, y - 27, 14, 11, "#274336");
    this.rect(x - 4, y - 30, 8, 7, "#34513a");
    this.rect(x - 8, y - 19, 8, 2, "#3e5940");
    this.rect(x + 1, y - 24, 4, 1, "#47634a");
  }

  private taxi(x: number, y: number, dx: number, dy: number, time: number, moving: boolean) {
    const c = this.ctx;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    const direction = horizontal ? (dx < 0 ? -1 : 1) : (dy < 0 ? -1 : 1);
    c.save();
    c.translate(Math.round(x), Math.round(y - 5));
    if (!horizontal) c.rotate(Math.PI / 2);
    if (direction < 0) c.scale(-1, 1);
    // Headlights are three stepped translucent blocks, without blur.
    c.globalAlpha = 0.09;
    for (let k = 0; k < 3; k++) this.rect(13 + k * 5, -6 - k * 2, 6, 12 + k * 4, "#ffe4a4");
    c.globalAlpha = 1;
    this.rect(-12, -7, 24, 16, "#142326");
    this.rect(-10, -9, 5, 3, "#151c25");
    this.rect(5, -9, 5, 3, "#151c25");
    this.rect(-10, 7, 5, 3, "#151c25");
    this.rect(5, 7, 5, 3, "#151c25");
    this.rect(-13, -6, 26, 12, "#b37e43");
    this.rect(-12, -7, 24, 12, "#e3ae52");
    this.rect(-11, -6, 22, 2, "#ffe096");
    this.rect(-7, -5, 4, 9, "#263d46");
    this.rect(3, -5, 4, 9, "#2b4751");
    this.rect(-2, -5, 4, 9, "#f2c66b");
    this.rect(-2, -3, 4, 3, "#ffe7a3");
    this.rect(-1, -2, 2, 1, "#35404a");
    this.rect(4, -2, 2, 2, "#f4c099");
    for (let k = -9; k < 11; k += 4) this.rect(k, 4, 2, 1, "#4b453c");
    this.rect(12, -4, 2, 3, "#fff2b7");
    this.rect(12, 2, 2, 3, "#fff2b7");
    this.rect(-13, -4, 2, 2, "#de7974");
    this.rect(-13, 3, 2, 2, "#de7974");
    if (moving && Math.floor(time * 8) % 2 === 0) this.rect(-17, 2, 2, 2, "#6c7965");
    c.restore();
  }

  private drawHub(s: GameState) {
    this.rect(0, 24, WIDTH, HEIGHT - 24, "#2c4337");
    for (let y = 34; y < 146; y += 12) for (let x = 5; x < WIDTH; x += 18) {
      this.rect(x, y, 2, 3, "#476144");
      this.rect(x + 3, y + 2, 2, 1, "#587251");
    }
    this.rect(31, 115, 258, 22, "#786e55");
    this.rect(80, 83, 24, 54, "#786e55");
    this.rect(207, 83, 24, 54, "#786e55");
    this.rect(147, 125, 26, 30, "#786e55");
    for (let x = 34; x < 288; x += 10) this.rect(x, 116, 7, 2, "#95836a");
    this.road(0, 143, WIDTH, 23, true);
    for (const point of HUB_POINTS) {
      if (point.id !== "taxi") this.building(point.x, point.y, point.id === "shop");
    }
    this.tree(18, 81); this.tree(300, 82);
    this.tree(34, 134); this.tree(286, 134);
    this.lamp(56, 111, s.time); this.lamp(261, 111, s.time);
    this.rect(139, 99, 42, 5, "#715f4c");
    this.rect(142, 104, 3, 6, "#253b35");
    this.rect(175, 104, 3, 6, "#253b35");
    this.taxi(160, 151, 1, 0, s.time, false);
    for (const point of HUB_POINTS) {
      if (Math.hypot(s.x - point.x, s.y - point.y) < 24) this.text("INTERACT", point.x, point.y + 16, "#fff3cf", 7);
    }
    this.rect(0, 166, WIDTH, 14, "#182d2b");
    this.text("WAYSIDE  //  HOME IS STILL HERE", 160, 174, "#a5b49b", 7);
    this.rect(0, 0, WIDTH, 24, INK);
  }

  private building(x: number, y: number, shop: boolean) {
    this.rect(x - 34, y - 37, 68, 36, shop ? "#a08461" : "#8c8d75");
    this.rect(x - 33, y - 36, 66, 3, "#d3b98d");
    for (let k = 0; k < 4; k++) this.rect(x - 31, y - 27 + k * 7, 62, 1, shop ? "#877055" : "#747a68");
    // Stepped roofs have deliberate GBA-sized shapes.
    for (let k = 0; k < 5; k++) this.rect(x - 38 + k * 3, y - 40 - k * 3, 76 - k * 6, 4, shop ? "#87624f" : "#526c67");
    this.rect(x - 25, y - 50, 50, 2, shop ? "#bc9166" : "#88a195");
    this.rect(x + 23, y - 56, 7, 12, "#78685d");
    this.rect(x + 21, y - 57, 11, 3, "#a29379");
    this.rect(x - 6, y - 17, 12, 17, "#24353a");
    this.rect(x - 4, y - 16, 8, 15, "#4a5450");
    this.rect(x + 2, y - 8, 1, 2, "#e3c48a");
    for (const dx of [-23, 15]) {
      this.rect(x + dx - 1, y - 23, 10, 13, "#525747");
      this.rect(x + dx, y - 22, 8, 10, "#efc98b");
      this.rect(x + dx + 3, y - 22, 1, 10, "#8d7755");
      this.rect(x + dx, y - 18, 8, 1, "#8d7755");
    }
    this.rect(x - 20, y - 34, 40, 11, "#263a38");
    this.text(shop ? "SHOP" : "HOME", x, y - 28, "#ffe4ac", 8);
    this.rect(x - 9, y - 1, 18, 3, "#b3a183");
    if (shop) {
      this.rect(x - 29, y - 8, 9, 8, "#715247");
      this.rect(x - 27, y - 11, 2, 4, "#f4c374");
      this.rect(x - 23, y - 11, 2, 4, "#ee9481");
      this.rect(x + 23, y - 7, 4, 7, "#4c6048");
      this.rect(x + 21, y - 10, 8, 4, "#6d8554");
    }
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
    const bossRoom = s.room === 2 && !realm;
    this.rect(0, 0, WIDTH, HEIGHT, realm ? "#101020" : "#171c27");
    for (let y = 30; y < HEIGHT; y += 16) for (let x = 0; x < WIDTH; x += 16) {
      const n = (x * 7 + y * 11 + s.room * 3) % 13;
      this.rect(x + 1, y + 1, 14, 14, realm ? (n < 6 ? "#302048" : "#201838") : bossRoom ? (n < 6 ? "#373043" : "#30283e") : n < 6 ? "#353340" : "#302e3a");
      this.rect(x + 2, y + 2, 11, 1, realm ? "#604080" : "#45414c");
      if (n < 3) this.rect(x + 10, y + 8, 3, 2, realm ? "#a04080" : "#5a4b48");
    }
    if (!realm) {
      if (s.room === 0) {
        // The first room is a blasted courtyard, with a crater rather than a roof.
        this.disc(171, 106, 36, "#5d494e");
        this.disc(171, 106, 30, "#413640");
        this.disc(171, 106, 22, "#292836");
        this.disc(171, 106, 12, "#232535");
        for (let k = 0; k < 18; k++) {
          const a = k * Math.PI / 9;
          this.rect(171 + Math.cos(a) * 32, 106 + Math.sin(a) * 30, 4, 2, k % 2 ? "#8c6260" : "#6e5158");
        }
      } else if (s.room === 1) {
        // Hairline tears in the paving lead toward the portal approach.
        for (let k = 0; k < 28; k++) {
          this.rect(83 + k * 6, 147 - k * 3, 9, 3, "#191d2c");
          if (k % 3 === 0) this.rect(85 + k * 6, 143 - k * 3, 6, 2, "#956184");
        }
        this.portal(248, 69, s.time, 0.65);
      } else {
        this.disc(182, 107, 53, "#46334f");
        this.disc(182, 107, 49, "#292639");
        this.disc(182, 107, 31, "#5f4063");
        this.disc(182, 107, 28, "#30283e");
        for (let k = 0; k < 12; k++) {
          const a = k * Math.PI / 6;
          this.rect(182 + Math.cos(a) * 41, 107 + Math.sin(a) * 41, 3, 4, "#a36d9f");
        }
      }
      for (let k = 0; k < 12; k++) {
        const x = 24 + (k * 79 + s.room * 47) % 265;
        const y = 57 + (k * 37 + s.room * 19) % 99;
        this.rect(x, y, 6, 3, "#514450");
        this.rect(x + 1, y - 2, 4, 2, "#726069");
        this.rect(x + 5, y + 3, 2, 1, "#9b756e");
      }
    }
    this.rect(0, 26, WIDTH, 16, realm ? "#604080" : "#62575b");
    this.rect(0, 42, WIDTH, 5, realm ? "#201030" : "#272735");
    for (let x = 0; x < WIDTH; x += 20) {
      this.rect(x, 28, 1, 12, realm ? "#302048" : "#383442");
      if (!realm && x % 60 === 0) this.rect(x + 5, 26, 12, 7, "#171c27");
    }
    for (const x of [5, 309]) {
      this.rect(x, 48, 6, 114, realm ? "#503060" : "#534652");
      for (let y = 55; y < 164; y += 16) this.rect(x, y, 6, 2, realm ? "#a060a0" : "#716067");
    }
    this.rect(0, 164, WIDTH, 16, realm ? "#302048" : "#322d3c");
    this.rect(0, 164, WIDTH, 2, realm ? "#8060a0" : "#62575b");
    this.lamp(20, 40, s.time, realm ? "#ff80c0" : "#ff9d66");
    this.lamp(300, 40, s.time, realm ? "#ff80c0" : "#ff9d66");
    if (!realm) {
      this.dungeonDoor(45, 108, true, false, s);
      this.dungeonDoor(292, 108, s.enemies.every((enemy) => enemy.hp <= 0), true, s);
      if (!bossRoom) this.text(s.room === 0 ? "THE BLAST SITE  //  IMPACT YARD" : "THE BLAST SITE  //  RIFT APPROACH", 160, 174, "#b8a0a8", 7);
    }
    this.rect(0, 0, WIDTH, 24, INK);
  }

  private portal(x: number, y: number, time: number, alpha = 1) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha * 0.14;
    this.disc(x, y - 15, 30, "#c179e8");
    c.globalAlpha = alpha;
    for (let k = 0; k < 32; k++) {
      const a = k * Math.PI / 16;
      this.rect(x + Math.cos(a) * 16, y - 16 + Math.sin(a) * 22, 3, 3, k % 3 ? "#aa75c9" : "#e4a2da");
    }
    this.rect(x - 11, y - 29, 22, 25, "#302044");
    this.rect(x - 7, y - 33, 14, 33, "#302044");
    for (let k = 0; k < 5; k++) {
      const px = x - 7 + ((k * 5 + Math.floor(time * 8)) % 14);
      const py = y - 28 + ((k * 11 + Math.floor(time * 13)) % 23);
      this.rect(px, py, 2, 3, "#9772b5");
    }
    c.restore();
  }

  private dungeonDoor(x: number, y: number, open: boolean, east: boolean, s: GameState) {
    const color = east ? (open ? "#a0d2b5" : "#b07c8d") : "#a7bbc4";
    this.rect(x - 10, y - 27, 20, 27, "#252536");
    this.rect(x - 12, y - 27, 4, 29, "#655765");
    this.rect(x + 8, y - 27, 4, 29, "#655765");
    this.rect(x - 12, y - 30, 24, 4, "#8f7181");
    this.rect(x - 10, y, 20, 3, color);
    if (!open) {
      for (let k = -6; k <= 6; k += 4) this.rect(x + k, y - 25, 2, 23, "#946077");
      this.rect(x - 7, y - 12, 15, 2, "#b87e94");
    } else {
      for (let k = 0; k < 3; k++) this.rect(x + (east ? k : -k), y - 15 + k, 2, 2, color);
      for (let k = 0; k < 3; k++) this.rect(x + (east ? k : -k), y - 13 - k, 2, 2, color);
      if (Math.hypot(s.x - x, s.y - y) < 24) this.text(east ? "CONTINUE" : "TAXI", x, y + 13, "#fff0cf", 7);
    }
  }

  private bossTelegraph(s: GameState, enemy: Enemy) {
    if (enemy.kind !== "boss" || (enemy.windup <= 0 && enemy.actionTimer <= 0)) return;
    const c = this.ctx;
    const color = enemy.phase === 2 ? "#ec7ead" : "#efab7a";
    c.save();
    c.globalAlpha = enemy.windup > 0 ? 0.3 + Math.sin(s.time * 23) * 0.08 : 0.2;
    if (enemy.pattern === 0) {
      const rushing = enemy.actionTimer > 0;
      for (let k = 0; k < (rushing ? 8 : 24); k++) {
        const distance = (rushing ? -1 : 1) * k * 5;
        const x = enemy.x + enemy.aimX * distance;
        const y = enemy.y + enemy.aimY * distance;
        if (x < 18 || x > 302 || y < 48 || y > 162) break;
        this.disc(x, y, rushing ? 9 - k * 0.6 : 9, color);
        if (k % 6 === 0) this.rect(x - 1, y - 1, 3, 3, "#ffddbb");
      }
    } else {
      for (const radius of [24, 43, 64]) for (let k = 0; k < 48; k++) {
        if (k % 4 === 0) continue;
        const a = k * Math.PI / 24;
        this.rect(enemy.x + Math.cos(a) * radius, enemy.y + Math.sin(a) * radius, 2, 2, color);
      }
      for (let k = 0; k < (enemy.phase === 2 ? 12 : 8); k++) {
        const a = k * Math.PI * 2 / (enemy.phase === 2 ? 12 : 8);
        this.rect(enemy.x + Math.cos(a) * 34, enemy.y + Math.sin(a) * 34, 4, 4, "#ffddbb");
      }
    }
    c.restore();
  }

  private bossBar(s: GameState) {
    const enemy = s.enemies.find((enemy) => enemy.kind === "boss" && enemy.hp > 0);
    if (!enemy) return;
    this.text(`THE WATCHER  //  PHASE ${enemy.phase}`, 160, 169, enemy.phase === 2 ? "#f2a6d1" : "#d7b4cd", 7);
    this.rect(83, 173, 154, 5, "#171723");
    this.rect(84, 174, 152, 3, "#644457");
    this.rect(84, 174, 152 * enemy.hp / enemy.maxHp, 3, enemy.phase === 2 ? "#ed8eba" : "#ad83c4");
    this.rect(160, 174, 1, 3, "#ffddc5");
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
    const scale = boss ? 1.6 : 1;
    const sprite = enemy.kind === "shooter" ? "imp" : enemy.sprite;
    if (boss && enemy.phase === 2) {
      this.ctx.globalAlpha = 0.17 + Math.sin(s.time * 15) * 0.05;
      this.disc(enemy.x, enemy.y - 23, 28, "#db82cb");
      this.ctx.globalAlpha = 1;
    }
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
