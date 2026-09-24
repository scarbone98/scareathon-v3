import * as THREE from "three";

// Small seeded generator for procedural textures, so the arena looks the same
// on every load.
export function textureRng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pixelate(t: THREE.Texture) {
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = pixelate(new THREE.CanvasTexture(c));
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function stoneTexture(seed: number, base: string, dark: string) {
  const r = textureRng(seed);
  return canvasTexture(16, 16, (ctx) => {
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, 16, 16);
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let col = -1; col < 2; col++) {
        ctx.fillStyle = base;
        ctx.fillRect(col * 8 + off + 1, row * 4 + 1, 7, 3);
        ctx.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.12)";
        ctx.fillRect(col * 8 + off + 1 + Math.floor(r() * 5), row * 4 + 1, 2, 1);
      }
    }
  });
}

const glowCache = new Map<string, THREE.Texture>();
export function glowTexture(color: string) {
  let t = glowCache.get(color);
  if (!t) {
    t = canvasTexture(8, 8, (ctx) => {
      ctx.fillStyle = color;
      ctx.fillRect(2, 1, 4, 6);
      ctx.fillRect(1, 2, 6, 4);
      ctx.fillStyle = "#fff";
      ctx.fillRect(3, 3, 2, 2);
    });
    glowCache.set(color, t);
  }
  return t;
}

// A tiny canvas health bar drawn as a billboard.
export class HpBar {
  sprite: THREE.Sprite;
  private ctx: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private last = -1;

  constructor(private color: string, width: number, height: number) {
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 4;
    this.ctx = c.getContext("2d")!;
    this.tex = pixelate(new THREE.CanvasTexture(c)) as THREE.CanvasTexture;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthTest: false, fog: false }));
    this.sprite.scale.set(width, height, 1);
    this.sprite.renderOrder = 20;
    this.set(1);
  }

  set(frac: number) {
    const px = Math.max(0, Math.ceil(frac * 22));
    if (px === this.last) return;
    this.last = px;
    const ctx = this.ctx;
    ctx.fillStyle = "#12091c";
    ctx.fillRect(0, 0, 24, 4);
    ctx.fillStyle = "#3a2446";
    ctx.fillRect(1, 1, 22, 2);
    ctx.fillStyle = this.color;
    ctx.fillRect(1, 1, px, 2);
    this.tex.needsUpdate = true;
  }

  dispose() {
    this.tex.dispose();
    this.sprite.material.dispose();
  }
}
