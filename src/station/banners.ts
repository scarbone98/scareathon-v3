// Scoreboard banners: the strip a player's place, avatar, name and points sit on. Each is a
// little pixel-art tile, drawn here, repeated along the row (so it fits any width) and
// shown unsmoothed. Which exist, their prices, and who owns which are on the server
// (server/routes/banners.js); the keys must match.

export type BannerKey =
  | "starry_night"
  | "pumpkin_patch"
  | "tv_static"
  | "candlelight"
  | "haunted_forest"
  | "moonlit_graveyard"
  | "blood_moon"
  | "ectoplasm"
  | "golden_ticket"
  | "empty";

// The banner everyone has, up until they put another up: an empty one. (On the server,
// no banner chosen means this one.)
export const DEFAULT_BANNER: BannerKey = "empty";

const W = 96;
const H = 24;

// The same speckle every time (a banner looks the same for everyone)
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sky(ctx: CanvasRenderingContext2D, top: string, bottom: string) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function px(ctx: CanvasRenderingContext2D, colour: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = colour;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function stars(ctx: CanvasRenderingContext2D, count: number, maxY: number, seed: number) {
  const rand = seeded(seed);
  for (let i = 0; i < count; i += 1) px(ctx, rand() < 0.8 ? "#d8d4f0" : "#fff2a8", rand() * W, rand() * maxY);
}

function moon(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  ctx.fillStyle = colour;
  for (let dy = -r; dy <= r; dy += 1)
    for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dy * dy <= r * r + r * 0.5) ctx.fillRect(x + dx, y + dy, 1, 1);
}

const PAINTERS: Record<BannerKey, (ctx: CanvasRenderingContext2D) => void> = {
  starry_night: (ctx) => {
    sky(ctx, "#0d0826", "#2b1650");
    stars(ctx, 60, H, 7);
    [[20, 6], [61, 15], [84, 4]].forEach(([x, y]) => {
      px(ctx, "#fffbe0", x, y);
      px(ctx, "rgba(255,251,224,0.5)", x - 1, y);
      px(ctx, "rgba(255,251,224,0.5)", x + 1, y);
      px(ctx, "rgba(255,251,224,0.5)", x, y - 1);
      px(ctx, "rgba(255,251,224,0.5)", x, y + 1);
    });
  },
  pumpkin_patch: (ctx) => {
    sky(ctx, "#140a06", "#3b1c08");
    stars(ctx, 14, 9, 3);
    px(ctx, "#1d140b", 0, 18, W, 6);
    [[8, 0], [30, 1], [52, 0], [75, 1]].forEach(([x, big]) => {
      const w = big ? 9 : 7;
      const h = big ? 6 : 5;
      px(ctx, "#e8701a", x, H - h - 2, w, h);
      px(ctx, "#ff9a3a", x + 1, H - h - 2, 1, h);
      px(ctx, "#b44f0e", x + Math.floor(w / 2), H - h - 2, 1, h);
      px(ctx, "#3f6b24", x + Math.floor(w / 2), H - h - 4, 1, 2);
      px(ctx, "#ffd75e", x + 2, H - h, 1, 1);
      px(ctx, "#ffd75e", x + w - 3, H - h, 1, 1);
    });
    for (let x = 0; x < W; x += 3) px(ctx, "#2d4a1c", x, 21 + (x % 2), 2, 1);
  },
  tv_static: (ctx) => {
    const rand = seeded(11);
    for (let y = 0; y < H; y += 1)
      for (let x = 0; x < W; x += 1) {
        const v = Math.floor(rand() * 120) + (y % 3 === 0 ? 0 : 30);
        px(ctx, `rgb(${v},${v},${v + 8})`, x, y);
      }
    px(ctx, "rgba(255,255,255,0.18)", 0, 9, W, 2);
  },
  candlelight: (ctx) => {
    sky(ctx, "#120a05", "#2a1709");
    [[10, 9], [34, 6], [58, 10], [80, 7]].forEach(([x, h]) => {
      const glow = ctx.createRadialGradient(x + 1, H - h - 4, 0, x + 1, H - h - 4, 9);
      glow.addColorStop(0, "rgba(255,190,90,0.5)");
      glow.addColorStop(1, "rgba(255,150,40,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 9, H - h - 13, 20, 18);
      px(ctx, "#efe3c8", x, H - h, 3, h);
      px(ctx, "#cbbd9c", x + 2, H - h, 1, h);
      px(ctx, "#ffd75e", x + 1, H - h - 3, 1, 2);
      px(ctx, "#ff8a2a", x + 1, H - h - 1, 1, 1);
    });
  },
  haunted_forest: (ctx) => {
    sky(ctx, "#08130e", "#1b2a1f");
    const rand = seeded(5);
    [6, 27, 49, 70, 88].forEach((x) => {
      px(ctx, "#050806", x, 4, 2, H - 4);
      for (let b = 0; b < 4; b += 1) {
        const y = 6 + Math.floor(rand() * 10);
        const dir = rand() < 0.5 ? -1 : 1;
        for (let k = 1; k < 5; k += 1) px(ctx, "#050806", x + dir * k + (dir > 0 ? 1 : 0), y - k);
      }
    });
    px(ctx, "rgba(170,190,180,0.18)", 0, 17, W, 3);
    px(ctx, "rgba(170,190,180,0.1)", 0, 15, W, 2);
  },
  moonlit_graveyard: (ctx) => {
    sky(ctx, "#0a1430", "#1d2a4a");
    stars(ctx, 20, 12, 9);
    moon(ctx, 70, 7, 4, "#efeadb");
    px(ctx, "#101722", 0, 20, W, 4);
    [[8, 0], [26, 1], [44, 0], [86, 1]].forEach(([x, cross]) => {
      if (cross) {
        px(ctx, "#5d6470", x + 2, 12, 2, 9);
        px(ctx, "#5d6470", x, 14, 6, 2);
      } else {
        px(ctx, "#5d6470", x, 14, 7, 7);
        px(ctx, "#5d6470", x + 1, 13, 5, 1);
        px(ctx, "#454b56", x + 2, 16, 3, 1);
      }
    });
  },
  blood_moon: (ctx) => {
    sky(ctx, "#1a0505", "#4a0d0d");
    moon(ctx, 48, 12, 8, "#c4261c");
    moon(ctx, 46, 10, 2, "#a81d14");
    [[14, 6], [24, 10], [74, 5], [84, 9]].forEach(([x, y]) => {
      px(ctx, "#0a0202", x, y, 1, 1);
      px(ctx, "#0a0202", x - 2, y - 1, 2, 1);
      px(ctx, "#0a0202", x + 1, y - 1, 2, 1);
      px(ctx, "#0a0202", x - 3, y - 2, 1, 1);
      px(ctx, "#0a0202", x + 3, y - 2, 1, 1);
    });
  },
  ectoplasm: (ctx) => {
    sky(ctx, "#060d08", "#0c1a10");
    px(ctx, "#4be36a", 0, 0, W, 3);
    const rand = seeded(13);
    for (let x = 0; x < W; x += 1) {
      const drip = rand() < 0.18 ? 3 + Math.floor(rand() * 12) : Math.floor(rand() * 2);
      px(ctx, "#3cc85a", x, 3, 1, drip);
      if (drip > 4) px(ctx, "#8dff9f", x, 3 + drip, 1, 1);
    }
    px(ctx, "rgba(140,255,160,0.5)", 0, 0, W, 1);
  },
  // Plain dark cloth: a little lighter along the top edge, a stitched hem along the
  // bottom, and the faint weave of it
  empty: (ctx) => {
    sky(ctx, "#232a38", "#151a24");
    px(ctx, "rgba(255,255,255,0.07)", 0, 0, W, 1);
    px(ctx, "rgba(0,0,0,0.35)", 0, H - 1, W, 1);
    for (let x = 1; x < W; x += 4) px(ctx, "rgba(242,234,210,0.12)", x, H - 3, 2, 1);
    const rand = seeded(11);
    for (let i = 0; i < 70; i += 1) px(ctx, rand() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)", rand() * W, 1 + rand() * (H - 5));
  },
  golden_ticket: (ctx) => {
    sky(ctx, "#9a6a12", "#e8b23a");
    for (let x = 0; x < W; x += 12) {
      px(ctx, "#fff0b8", x + 1, 3, 10, 18);
      px(ctx, "#e8b23a", x + 1, 11, 1, 2);
      px(ctx, "#e8b23a", x + 10, 11, 1, 2);
      for (let y = 5; y < 20; y += 2) px(ctx, "#d4a030", x + 6, y);
    }
    [[20, 2], [56, 21], [88, 2]].forEach(([x, y]) => px(ctx, "#ffffff", x, y));
  },
};

const cache = new Map<string, string>();

function bannerCanvas(key: string) {
  if (!(key in PAINTERS)) return null;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  PAINTERS[key as BannerKey](ctx);
  return canvas;
}

// The banner's tile as an image URL (made once)
export function bannerImage(key: string): string | null {
  const cached = cache.get(key);
  if (cached) return cached;
  const url = bannerCanvas(key)?.toDataURL() ?? null;
  if (url) cache.set(key, url);
  return url;
}

// Your banner is your avatar's background too. Mostly it's a section of the banner, a
// portrait slice of the tile from this far along it (where there's something to see);
// some banners have a background painted for them instead.
const CUSTOM_BACKGROUNDS: Partial<Record<BannerKey, string>> = {
  moonlit_graveyard: "/avatar-px/items/moonlit_graveyard/0-background.png",
};
const SECTION_X: Partial<Record<BannerKey, number>> = { starry_night: 12, pumpkin_patch: 27, candlelight: 54, blood_moon: 42, golden_ticket: 46 };
const SECTION_W = 16;

export function bannerBackground(key: string): string | null {
  const custom = CUSTOM_BACKGROUNDS[key as BannerKey];
  if (custom) return custom;
  const cached = cache.get(`${key}:background`);
  if (cached) return cached;
  const tile = bannerCanvas(key);
  if (!tile) return null;
  const canvas = document.createElement("canvas");
  canvas.width = SECTION_W;
  canvas.height = H;
  const x = SECTION_X[key as BannerKey] ?? (W - SECTION_W) / 2;
  canvas.getContext("2d")?.drawImage(tile, x, 0, SECTION_W, H, 0, 0, SECTION_W, H);
  const url = canvas.toDataURL();
  cache.set(`${key}:background`, url);
  return url;
}

// The banner as a shop item's icon: a square cut from the tile, where there's something
// to see (the stretch the background comes from)
export function bannerSquare(key: string): string | null {
  const cached = cache.get(`${key}:square`);
  if (cached) return cached;
  const tile = bannerCanvas(key);
  if (!tile) return null;
  const canvas = document.createElement("canvas");
  canvas.width = H;
  canvas.height = H;
  const middle = (SECTION_X[key as BannerKey] ?? (W - SECTION_W) / 2) + SECTION_W / 2;
  const x = Math.round(Math.min(Math.max(middle - H / 2, 0), W - H));
  canvas.getContext("2d")?.drawImage(tile, x, 0, H, H, 0, 0, H, H);
  const url = canvas.toDataURL();
  cache.set(`${key}:square`, url);
  return url;
}

// The CSS for the frame an avatar stands in: their banner's background, filling it,
// standing on its bottom edge
export function backdropStyle(key: string | null | undefined): React.CSSProperties | undefined {
  // (the empty banner leaves the frame as it was: blown up, its weave is just blotches)
  const url = key && key !== DEFAULT_BANNER ? bannerBackground(key) : null;
  if (!url) return undefined;
  return { backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center bottom", imageRendering: "pixelated" };
}

// The CSS for a row (or a sample) on a banner: the tile repeated along it, full height
export function bannerStyle(key: string | null | undefined): React.CSSProperties | undefined {
  const url = key ? bannerImage(key) : null;
  if (!url) return undefined;
  return { backgroundImage: `url(${url})`, backgroundSize: "auto 100%", backgroundRepeat: "repeat-x", imageRendering: "pixelated" };
}
