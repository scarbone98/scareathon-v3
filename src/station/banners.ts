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
  | "autumn_leaves"
  | "candy_corn"
  | "cobwebs"
  | "harvest_moon"
  | "wheat_field"
  | "orchard"
  | "swimming_pool"
  | "national_park"
  | "campsite"
  | "lake_monster"
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
  // Fall
  autumn_leaves: (ctx) => {
    sky(ctx, "#2a1608", "#5c2c0c");
    const rand = seeded(21);
    const colours = ["#e8701a", "#f8a24a", "#c8321e", "#ecc84a", "#8a3a0c"];
    for (let i = 0; i < 46; i += 1) {
      const x = Math.floor(rand() * (W - 3));
      const y = Math.floor(rand() * (H - 3));
      const colour = colours[Math.floor(rand() * colours.length)];
      px(ctx, colour, x, y, 2, 1);
      px(ctx, colour, x + 1, y + 1);
      if (rand() < 0.4) px(ctx, "#3c2418", x + 2, y + 2);
    }
    // (a drift of them along the bottom)
    for (let x = 0; x < W; x += 1) px(ctx, colours[(x * 7) % colours.length], x, H - 2 - ((x * 5) % 3 === 0 ? 1 : 0), 1, 3);
  },
  candy_corn: (ctx) => {
    sky(ctx, "#2b1040", "#1a0a2a");
    // Kernels in a row, every other one upside down: white tip, orange middle, yellow base
    const kernel: [number, number, string][] = [[2, 2, "#fff6e0"], [1, 4, "#fff6e0"], [1, 4, "#f07a1a"], [0, 6, "#f07a1a"], [0, 6, "#fbc02a"], [0, 6, "#fbc02a"]];
    for (let i = 0; i < 12; i += 1) {
      const up = i % 2 === 0;
      (up ? kernel : [...kernel].reverse()).forEach(([dx, w, colour], row) => px(ctx, colour, i * 8 + 1 + dx, (up ? 4 : 13) + row, w, 1));
    }
  },
  cobwebs: (ctx) => {
    sky(ctx, "#0e0f18", "#1c1d2c");
    const web = "rgba(214,220,235,0.75)";
    const faint = "rgba(214,220,235,0.35)";
    // A web spun from the top, one every 48px: spokes fanning down, threads strung between
    [0, 48].forEach((ox) => {
      const cx = ox + 24;
      for (let k = 0; k < 14; k += 1) {
        px(ctx, web, cx, k);
        px(ctx, web, cx - k, Math.round(k * 0.8));
        px(ctx, web, cx + k, Math.round(k * 0.8));
        px(ctx, web, cx - Math.round(k * 1.7), Math.round(k * 0.45));
        px(ctx, web, cx + Math.round(k * 1.7), Math.round(k * 0.45));
      }
      [5, 9, 13].forEach((r) => {
        for (let x = -Math.round(r * 1.7); x <= r * 1.7; x += 1) px(ctx, faint, cx + x, Math.round(r * 0.45 + (1 - Math.abs(x) / (r * 1.7)) * r * 0.5));
      });
    });
    // A spider let down on a thread
    px(ctx, faint, 70, 0, 1, 15);
    px(ctx, "#0a0a12", 69, 15, 3, 3);
    px(ctx, "#0a0a12", 68, 15);
    px(ctx, "#0a0a12", 72, 15);
    px(ctx, "#0a0a12", 68, 17);
    px(ctx, "#0a0a12", 72, 17);
    px(ctx, "#c41e24", 70, 16);
  },
  harvest_moon: (ctx) => {
    sky(ctx, "#1c0c1e", "#5a2410");
    stars(ctx, 16, 8, 17);
    moon(ctx, 48, 12, 8, "#f8a24a");
    moon(ctx, 45, 9, 2, "#e87a22");
    moon(ctx, 52, 15, 1, "#e87a22");
    // Corn stalks along the bottom, dark against it
    for (let x = 1; x < W; x += 6) {
      const h = 6 + ((x * 7) % 5);
      px(ctx, "#140a08", x + 2, H - h, 1, h);
      px(ctx, "#140a08", x + 1, H - h + 2);
      px(ctx, "#140a08", x + 3, H - h + 4);
      px(ctx, "#140a08", x, H - h + 3);
      px(ctx, "#140a08", x + 4, H - h + 5);
    }
    px(ctx, "#140a08", 0, H - 2, W, 2);
  },
  // Summer
  wheat_field: (ctx) => {
    sky(ctx, "#6ab4f2", "#c8e6fa");
    [[14, 4], [58, 6], [84, 3]].forEach(([x, y]) => {
      px(ctx, "#ffffff", x, y, 9, 2);
      px(ctx, "#ffffff", x + 2, y - 1, 5, 1);
    });
    px(ctx, "#d4ac2a", 0, 13, W, 11);
    for (let x = 0; x < W; x += 1) {
      const h = 2 + ((x * 13) % 4);
      px(ctx, x % 2 ? "#ecc84a" : "#b8901c", x, 15 - h, 1, h);
      if (x % 3 === 0) px(ctx, "#f8dc6a", x, 14 - h);
      if (x % 5 === 0) px(ctx, "#8a6a10", x, 17 + ((x * 3) % 5), 1, 2);
    }
  },
  orchard: (ctx) => {
    sky(ctx, "#8cc8f0", "#d8f0c8");
    px(ctx, "#56902e", 0, 19, W, 5);
    for (let x = 0; x < W; x += 4) px(ctx, "#7ab83e", x + ((x / 4) % 2), 19, 2, 1);
    [8, 32, 56, 80].forEach((x, i) => {
      px(ctx, "#5a3820", x + 3, 12, 2, 8);
      moon(ctx, x + 4, 8, 5, "#3c6a28");
      moon(ctx, x + 2, 6, 2, "#56902e");
      // Apples, and one fallen
      [[1, 6], [6, 9], [3, 10], [7, 5], [0, 10]].forEach(([dx, dy], n) => px(ctx, (n + i) % 3 === 0 ? "#f8dc6a" : "#d84050", x + dx, dy));
      px(ctx, "#d84050", x + 8, 20);
    });
  },
  swimming_pool: (ctx) => {
    sky(ctx, "#2aa0d8", "#1a6ab0");
    // Ripples of light on the water
    const rand = seeded(31);
    for (let i = 0; i < 40; i += 1) {
      const x = Math.floor(rand() * (W - 6));
      const y = 5 + Math.floor(rand() * (H - 7));
      px(ctx, "rgba(190,240,255,0.55)", x, y, 3 + Math.floor(rand() * 3), 1);
    }
    // The tiled edge along the top, and a lane rope with its floats
    px(ctx, "#e8f4f8", 0, 0, W, 3);
    for (let x = 0; x < W; x += 6) px(ctx, "#9cc4d4", x, 0, 1, 3);
    px(ctx, "#0e4a80", 0, 3, W, 1);
    for (let x = 0; x < W; x += 4) px(ctx, (x / 4) % 2 ? "#ffffff" : "#e43b3b", x, 14, 3, 2);
  },
  national_park: (ctx) => {
    sky(ctx, "#f2a65a", "#f8dca0");
    // Far peaks, snow-capped, then a nearer ridge of pines
    [[10, 6], [34, 3], [58, 7], [82, 4]].forEach(([x, top]) => {
      for (let y = top; y < 18; y += 1) px(ctx, "#6a5a8c", x - (y - top), y, (y - top) * 2 + 1, 1);
      for (let y = top; y < top + 3; y += 1) px(ctx, "#f4f0ff", x - (y - top), y, (y - top) * 2 + 1, 1);
    });
    px(ctx, "#3a2c5c", 0, 16, W, 8);
    for (let x = 0; x < W; x += 6) {
      const h = 6 + ((x * 5) % 4);
      for (let k = 0; k < h; k += 1) px(ctx, "#1e3a2c", x + 3 - Math.floor(k / 2), H - 3 - h + k, Math.floor(k / 2) * 2 + 1, 1);
    }
    px(ctx, "#16281e", 0, H - 3, W, 3);
  },
  campsite: (ctx) => {
    sky(ctx, "#0a1024", "#1c2440");
    stars(ctx, 36, 12, 23);
    px(ctx, "#101a14", 0, 20, W, 4);
    // Pines behind, a tent, and a fire with its glow
    [4, 22, 66, 88].forEach((x) => {
      for (let k = 0; k < 10; k += 1) px(ctx, "#0c1a14", x - Math.floor(k / 2), 10 + k, Math.floor(k / 2) * 2 + 1, 1);
    });
    for (let k = 0; k < 8; k += 1) px(ctx, "#2c866b", 40 - k, 12 + k, k * 2 + 1, 1);
    for (let k = 3; k < 8; k += 1) px(ctx, "#0a0e12", 40 - Math.floor(k / 3), 12 + k, Math.floor(k / 3) * 2 + 1, 1);
    const glow = ctx.createRadialGradient(58, 18, 0, 58, 18, 10);
    glow.addColorStop(0, "rgba(255,170,70,0.55)");
    glow.addColorStop(1, "rgba(255,140,40,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(48, 8, 20, 14);
    px(ctx, "#5a3820", 56, 20, 5, 1);
    px(ctx, "#f07a1a", 57, 17, 3, 3);
    px(ctx, "#fbc02a", 58, 16, 1, 3);
    px(ctx, "#fff2a0", 58, 18);
  },
  // Cryptids
  lake_monster: (ctx) => {
    sky(ctx, "#0c1630", "#22365a");
    stars(ctx, 18, 9, 29);
    moon(ctx, 78, 5, 3, "#efeadb");
    // The far shore, then the water with the moon on it
    for (let x = 0; x < W; x += 1) px(ctx, "#0a1220", x, 11 - ((x * 7) % 3 === 0 ? 1 : 0), 1, 2);
    px(ctx, "#16284a", 0, 13, W, 11);
    for (let y = 14; y < H; y += 2) px(ctx, "rgba(239,234,219,0.35)", 74 + ((y * 3) % 5), y, 6 - ((y * 2) % 3), 1);
    // A long neck and two humps
    px(ctx, "#081018", 30, 9, 2, 7);
    px(ctx, "#081018", 31, 8, 4, 2);
    px(ctx, "#c4e0f0", 33, 8);
    px(ctx, "#081018", 38, 13, 6, 3);
    px(ctx, "#081018", 39, 12, 4, 1);
    px(ctx, "#081018", 48, 14, 5, 2);
    px(ctx, "#081018", 49, 13, 3, 1);
    px(ctx, "#081018", 56, 14, 2, 1);
    px(ctx, "rgba(196,224,240,0.4)", 28, 16, 30, 1);
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
const SECTION_X: Partial<Record<BannerKey, number>> = {
  starry_night: 12,
  pumpkin_patch: 27,
  candlelight: 54,
  blood_moon: 42,
  golden_ticket: 46,
  cobwebs: 62,
  harvest_moon: 40,
  wheat_field: 52,
  orchard: 28,
  national_park: 26,
  campsite: 44,
  lake_monster: 28,
};
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
