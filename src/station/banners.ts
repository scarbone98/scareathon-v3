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
  | "haunted_house"
  | "northern_lights"
  | "deep_space"
  | "thunderstorm"
  | "night_line"
  | "arcade_carpet"
  | "bat_flight"
  | "slime_drip"
  | "hellmouth"
  | "first_snow"
  | "sunset_beach"
  | "checkerboard"
  | "vhs_tracking"
  | "abduction"
  | "fairy_ring"
  | "eight_bit_evil"
  | "howling_wolf"
  | "witch_flight"
  | "jack_o_lanterns"
  | "ghost_parade"
  | "scarecrow"
  | "lighthouse"
  | "city_rain"
  | "drive_in"
  | "big_top"
  | "catacombs"
  | "eyes_in_the_dark"
  | "ghost_ship"
  | "mad_lab"
  | "cherry_blossoms"
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
  // More: places, weather, and a few patterns
  haunted_house: (ctx) => {
    sky(ctx, "#161033", "#3a2350");
    stars(ctx, 14, 10, 41);
    moon(ctx, 74, 6, 4, "#f0e8c8");
    const dark = "#0a0812";
    // The hill, the house on it (a tower to one side), and a dead tree
    for (let x = 0; x < W; x += 1) {
      const y = 19 - Math.round(4 * Math.sin((Math.PI * x) / W));
      px(ctx, dark, x, y, 1, H - y);
    }
    px(ctx, dark, 38, 9, 12, 9);
    for (let r = 0; r < 5; r += 1) px(ctx, dark, 43 - r, 4 + r, 2 + 2 * r, 1);
    px(ctx, dark, 48, 3, 3, 6);
    px(ctx, dark, 49, 1, 1, 2);
    px(ctx, "#f8c040", 40, 11, 2, 2);
    px(ctx, "#f8c040", 46, 12, 2, 2);
    px(ctx, "#f8c040", 49, 5, 1, 2);
    px(ctx, "#1c1420", 43, 14, 2, 4);
    px(ctx, dark, 20, 10, 1, 8);
    px(ctx, dark, 18, 11, 2, 1);
    px(ctx, dark, 21, 9, 2, 1);
    px(ctx, dark, 17, 10);
  },
  northern_lights: (ctx) => {
    sky(ctx, "#040818", "#0a1a2c");
    stars(ctx, 20, 8, 51);
    // Two ribbons of light, the green over the violet, waving along the sky
    for (let x = 0; x < W; x += 1) {
      const y = 5 + Math.round(3 * Math.sin((x * Math.PI * 2) / 48));
      px(ctx, "rgba(170,110,255,0.45)", x, y - 2 + Math.round(2 * Math.sin((x * Math.PI * 2) / 32 + 1)), 1, 2);
      px(ctx, "rgba(80,255,170,0.55)", x, y, 1, 3);
      px(ctx, "rgba(80,255,170,0.22)", x, y + 3, 1, 4);
    }
    px(ctx, "#c8d8e8", 0, 20, W, 4);
    for (let x = 0; x < W; x += 1) if ((x * 5) % 7 < 3) px(ctx, "#e8f0f8", x, 20);
    [8, 22, 37, 58, 71, 88].forEach((x, i) => {
      const tall = 4 + (i % 2);
      for (let r = 0; r < tall; r += 1) px(ctx, "#0c241c", x - r, 19 - tall + r, 1 + 2 * r, 1);
      px(ctx, "#0c241c", x, 19);
    });
  },
  deep_space: (ctx) => {
    sky(ctx, "#05030f", "#120a28");
    const cloud = ctx.createRadialGradient(26, 12, 1, 26, 12, 22);
    cloud.addColorStop(0, "rgba(210,80,200,0.5)");
    cloud.addColorStop(0.6, "rgba(90,60,200,0.2)");
    cloud.addColorStop(1, "rgba(90,60,200,0)");
    ctx.fillStyle = cloud;
    ctx.fillRect(0, 0, 52, H);
    stars(ctx, 40, H, 61);
    // A banded planet with a ring, and a shooting star
    moon(ctx, 68, 11, 5, "#d8884a");
    px(ctx, "#b0642e", 64, 10, 9, 1);
    px(ctx, "#e8a868", 65, 13, 7, 1);
    px(ctx, "#b0642e", 65, 15, 6, 1);
    const ring = "rgba(240,220,180,0.85)";
    px(ctx, ring, 58, 14, 4, 1);
    px(ctx, ring, 61, 13, 2, 1);
    px(ctx, ring, 74, 9, 2, 1);
    px(ctx, ring, 75, 8, 4, 1);
    px(ctx, "#ffffff", 42, 5);
    px(ctx, "rgba(255,255,255,0.6)", 40, 4, 2, 1);
    px(ctx, "rgba(255,255,255,0.3)", 37, 3, 3, 1);
  },
  thunderstorm: (ctx) => {
    sky(ctx, "#10121c", "#262a3a");
    const rand = seeded(67);
    for (let i = 0; i < 44; i += 1) px(ctx, "rgba(160,190,230,0.45)", rand() * W, 6 + rand() * 15, 1, 2);
    // The cloud's underside, all along the top, and two forks of lightning out of it
    for (let x = 0; x < W; x += 1) {
      const h = 5 + Math.round(2 * Math.sin(x / 5) + Math.sin(x / 2.3));
      px(ctx, "#3a3f52", x, 0, 1, h);
      px(ctx, "#4c5268", x, h - 1);
    }
    [[30, 5], [29, 7], [31, 9], [29, 12], [30, 15], [28, 18]].forEach(([x, y]) => {
      px(ctx, "rgba(255,246,176,0.35)", x - 1, y, 3, 3);
      px(ctx, "#fff6b0", x, y, 1, 3);
    });
    [[78, 6], [79, 8], [77, 10], [78, 13]].forEach(([x, y]) => px(ctx, "rgba(255,246,176,0.55)", x, y, 1, 3));
    px(ctx, "#0a0c12", 0, 22, W, 2);
  },
  night_line: (ctx) => {
    sky(ctx, "#0a0c1a", "#1c2238");
    stars(ctx, 16, 9, 71);
    // The line at night: sleepers and rails, the wires overhead, a signal at green, and a
    // headlight a long way off
    px(ctx, "rgba(200,200,220,0.25)", 0, 9, W, 1);
    [34, 82].forEach((x) => {
      px(ctx, "#1a1410", x, 7, 1, 11);
      px(ctx, "#1a1410", x - 2, 8, 5, 1);
    });
    px(ctx, "#15130f", 0, 17, W, 7);
    for (let x = 1; x < W; x += 6) px(ctx, "#3a2c1e", x, 18, 2, 5);
    px(ctx, "#8a909c", 0, 19, W, 1);
    px(ctx, "#8a909c", 0, 22, W, 1);
    px(ctx, "#20242c", 70, 6, 1, 12);
    px(ctx, "#101216", 69, 4, 3, 5);
    px(ctx, "rgba(58,255,122,0.3)", 68, 4, 5, 3);
    px(ctx, "#3aff7a", 70, 5);
    const lamp = ctx.createRadialGradient(13, 16, 0, 13, 16, 7);
    lamp.addColorStop(0, "rgba(255,243,200,0.8)");
    lamp.addColorStop(1, "rgba(255,243,200,0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(5, 9, 16, 14);
    px(ctx, "#fff3c8", 12, 15, 2, 2);
  },
  arcade_carpet: (ctx) => {
    px(ctx, "#141028", 0, 0, W, H);
    // The carpet every arcade had: squiggles, dashes, triangles and rings, loud on the dark
    const rand = seeded(83);
    const colours = ["#ff3ea5", "#3ee0ff", "#ffe23e", "#7dff6a", "#b45cff"];
    for (let i = 0; i < 34; i += 1) {
      const x = Math.floor(rand() * (W - 5));
      const y = Math.floor(rand() * (H - 3));
      const colour = colours[Math.floor(rand() * colours.length)];
      const kind = Math.floor(rand() * 4);
      if (kind === 0) for (let k = 0; k < 5; k += 1) px(ctx, colour, x + k, y + (k % 2));
      else if (kind === 1) px(ctx, colour, x, y, 3, 1);
      else if (kind === 2) {
        px(ctx, colour, x + 1, y);
        px(ctx, colour, x, y + 1, 3, 1);
      } else {
        px(ctx, colour, x, y, 3, 1);
        px(ctx, colour, x, y + 2, 3, 1);
        px(ctx, colour, x - 1, y + 1);
        px(ctx, colour, x + 3, y + 1);
      }
    }
  },
  bat_flight: (ctx) => {
    sky(ctx, "#3a1850", "#e06a3a");
    moon(ctx, 20, 8, 5, "#fff0c8");
    const dark = "#120818";
    // Bats out at dusk, across the moon and off down the sky
    const rand = seeded(97);
    [[16, 5], [24, 9], ...Array.from({ length: 8 }, () => [30 + Math.floor(rand() * 60), 2 + Math.floor(rand() * 13)])].forEach(([x, y]) => {
      px(ctx, dark, x + 1, y);
      px(ctx, dark, x + 3, y);
      px(ctx, dark, x, y + 1, 5, 1);
      px(ctx, dark, x + 2, y + 2);
    });
    for (let x = 0; x < W; x += 1) {
      const h = 2 + ((x * 13) % 4);
      px(ctx, dark, x, H - h, 1, h);
    }
  },
  slime_drip: (ctx) => {
    sky(ctx, "#10140c", "#1c2414");
    // Slime coming down from the top edge: long drips, and drops let go of them
    for (let x = 0; x < W; x += 1) {
      const long = (x * 7) % 11 === 0;
      const len = 3 + Math.round(3 * Math.abs(Math.sin(x * 0.35))) + (long ? 6 : 0);
      px(ctx, "#6ad63a", x, 0, 1, len);
      px(ctx, "#4aa82a", x, len - 1);
      if (long) {
        px(ctx, "#6ad63a", x, len + 2, 1, 2);
        px(ctx, "#a8f060", x, len + 2);
      }
    }
    px(ctx, "#a8f060", 0, 0, W, 1);
    for (let x = 3; x < W; x += 9) px(ctx, "#d8ffa0", x, 2, 2, 1);
  },
  hellmouth: (ctx) => {
    sky(ctx, "#1a0406", "#4a0c08");
    const rand = seeded(101);
    for (let i = 0; i < 16; i += 1) px(ctx, rand() < 0.5 ? "#fbc02a" : "#f07a1a", rand() * W, 4 + rand() * 10);
    // Rock hanging from the roof, and the lava below, its surface brightest
    for (let x = 0; x < W; x += 1) if (x % 8 < 3) px(ctx, "#0c0204", x, 0, 1, 3 + ((x * 5) % 4));
    for (let x = 0; x < W; x += 1) {
      const y = 16 + Math.round(2 * Math.sin((x * Math.PI * 2) / 24));
      px(ctx, "#f07a1a", x, y, 1, H - y);
      px(ctx, "#fbc02a", x, y);
      px(ctx, "#c2400e", x, y + 3, 1, H);
    }
    [[10, 20], [33, 21], [58, 20], [81, 21]].forEach(([x, y]) => px(ctx, "#fff2a0", x, y, 2, 1));
  },
  first_snow: (ctx) => {
    sky(ctx, "#1c2a44", "#5a6c8c");
    for (let x = 0; x < W; x += 1) {
      const y = 17 + Math.round(2 * Math.sin((x * Math.PI * 4) / W));
      px(ctx, "#e8eef6", x, y, 1, H - y);
      px(ctx, "#c4d0e0", x, y + 3, 1, H);
    }
    // A snowman, hat and carrot and all, and the snow still coming down
    moon(ctx, 60, 17, 2, "#ffffff");
    moon(ctx, 60, 13, 1, "#ffffff");
    px(ctx, "#1a1a22", 59, 11, 3, 1);
    px(ctx, "#1a1a22", 60, 10);
    px(ctx, "#f07a1a", 61, 13);
    px(ctx, "#1a1a22", 60, 16);
    const rand = seeded(103);
    for (let i = 0; i < 36; i += 1) px(ctx, "#ffffff", rand() * W, rand() * 17);
  },
  sunset_beach: (ctx) => {
    sky(ctx, "#3a1c5a", "#f08a4a");
    moon(ctx, 48, 13, 5, "#ffd86a");
    // The sun half down into the sea, its light on the water; sand, and a palm
    px(ctx, "#1c3a6a", 0, 14, W, 6);
    for (let y = 15; y < 20; y += 1) px(ctx, "rgba(255,216,106,0.6)", 45 + ((y * 3) % 3), y, 6 - (y % 2) * 2, 1);
    px(ctx, "#d8b878", 0, 20, W, 4);
    for (let x = 0; x < W; x += 1) if ((x * 3) % 7 === 0) px(ctx, "#c0a060", x, 21 + (x % 2));
    const trunk = "#2a1810";
    const frond = "#14301c";
    px(ctx, trunk, 16, 9, 1, 11);
    px(ctx, trunk, 17, 8, 1, 2);
    px(ctx, frond, 15, 6, 5, 1);
    px(ctx, frond, 13, 7, 4, 1);
    px(ctx, frond, 18, 7, 4, 1);
    px(ctx, frond, 12, 8, 2, 1);
    px(ctx, frond, 20, 8, 2, 1);
  },
  checkerboard: (ctx) => {
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) px(ctx, (x / 4 + y / 4) % 2 ? "#2a1648" : "#120a20", x, y, 4, 4);
    const sheen = ctx.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, "rgba(180,92,255,0.22)");
    sheen.addColorStop(1, "rgba(180,92,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);
  },
  vhs_tracking: (ctx) => {
    // The colour bars off a tape, scan lines over them, and the tracking gone along one band
    ["#c0c0c0", "#c0c000", "#00c0c0", "#00c000", "#c000c0", "#c00000", "#0000c0", "#101010"].forEach((colour, i) => px(ctx, colour, i * 12, 0, 12, H));
    px(ctx, "rgba(0,0,0,0.4)", 0, 0, W, H);
    for (let y = 0; y < H; y += 2) px(ctx, "rgba(0,0,0,0.25)", 0, y, W, 1);
    const rand = seeded(107);
    for (let x = 0; x < W; x += 1) {
      const tear = Math.floor(rand() * 3);
      px(ctx, `rgba(255,255,255,${0.25 + rand() * 0.5})`, x, 15 + tear, 1, 1);
      if (rand() < 0.3) px(ctx, "rgba(0,0,0,0.6)", x, 17, 2, 1);
    }
    px(ctx, "#ffffff", 4, 3, 1, 5);
    px(ctx, "#ffffff", 5, 4, 1, 3);
    px(ctx, "#ffffff", 6, 5);
  },
  abduction: (ctx) => {
    sky(ctx, "#060a1c", "#14203a");
    stars(ctx, 18, 10, 81);
    px(ctx, "#0c1a10", 0, 20, W, 4);
    px(ctx, "#3a1410", 14, 14, 8, 6);
    px(ctx, "#20100c", 13, 13, 10, 1);
    px(ctx, "#20100c", 15, 12, 6, 1);
    // A saucer over the field, its beam down, and a cow on the way up
    for (let y = 8; y < 20; y += 1) {
      const w = 4 + (y - 8);
      px(ctx, "rgba(160,255,200,0.22)", 48 - Math.floor(w / 2), y, w, 1);
    }
    px(ctx, "#8a92a8", 43, 6, 11, 2);
    px(ctx, "#c0c6d6", 45, 5, 7, 1);
    px(ctx, "#7dffd0", 46, 3, 5, 2);
    [44, 48, 52].forEach((x) => px(ctx, "#ffe23e", x, 7));
    px(ctx, "#f2f0e8", 46, 14, 4, 2);
    px(ctx, "#1a1a1a", 47, 14);
    px(ctx, "#f2f0e8", 50, 13, 1, 2);
    px(ctx, "#f2f0e8", 46, 16);
    px(ctx, "#f2f0e8", 49, 16);
  },
  fairy_ring: (ctx) => {
    sky(ctx, "#060c0a", "#10201a");
    [6, 30, 66, 90].forEach((x) => px(ctx, "#030605", x, 0, 3, H));
    px(ctx, "#0a1410", 0, 20, W, 4);
    // Toadstools in a ring in the wood, each with a glow of its own, and fireflies over them
    [14, 22, 40, 48, 56, 74, 82].forEach((x, i) => {
      const cap = i % 2 ? "#7dffd0" : "#ff5a7a";
      const glow = ctx.createRadialGradient(x + 0.5, 17, 0, x + 0.5, 17, 5);
      glow.addColorStop(0, i % 2 ? "rgba(125,255,208,0.4)" : "rgba(255,90,122,0.4)");
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 5, 12, 11, 10);
      px(ctx, "#e8f0e0", x, 18, 1, 2);
      px(ctx, cap, x - 1, 17, 3, 1);
      px(ctx, cap, x, 16);
    });
    const rand = seeded(109);
    for (let i = 0; i < 10; i += 1) px(ctx, "#e8ff8a", rand() * W, 3 + rand() * 11);
  },
  // Fifteen more: monsters, the pictures, and one for spring
  eight_bit_evil: (ctx) => {
    // The original game: its purple ground, the horde closing in, and Alex in the middle
    // holding the trophy up
    px(ctx, "#3a3558", 0, 0, W, H);
    const rand = seeded(113);
    for (let i = 0; i < 9; i += 1) px(ctx, "#2f2a4c", rand() * (W - 12), rand() * (H - 5), 6 + Math.floor(rand() * 8), 3 + Math.floor(rand() * 4));
    for (let i = 0; i < 150; i += 1) px(ctx, "#4a5068", rand() * W, rand() * H);
    [[8, 4], [20, 13], [33, 7], [62, 12], [74, 3], [86, 11]].forEach(([x, y]) => {
      const reach = x < 48 ? 2 : -1;
      px(ctx, "#4fc48a", x, y, 2, 2);
      px(ctx, "#2c8a6a", x, y + 2, 2, 2);
      px(ctx, "#4fc48a", x + reach, y + 2);
      px(ctx, "#1c5a48", x, y + 4);
      px(ctx, "#1c5a48", x + 1, y + 5);
    });
    px(ctx, "#fbc02a", 47, 5, 2, 2);
    px(ctx, "#fbc02a", 47, 7, 1, 1);
    px(ctx, "#1a1a22", 47, 8, 2, 1);
    px(ctx, "#f0c090", 47, 9, 2, 2);
    px(ctx, "#c4322a", 46, 11, 4, 2);
    px(ctx, "#2a4a7a", 47, 13, 2, 3);
    // The graveyard along the bottom of the frame
    for (let x = 0; x < W; x += 1) px(ctx, "#000000", x, H - 2 - ((x * 11) % 7 < 2 ? 2 : (x * 5) % 9 < 3 ? 1 : 0), 1, 4);
    [14, 70].forEach((x) => {
      px(ctx, "#000000", x, H - 7, 1, 5);
      px(ctx, "#000000", x - 1, H - 6, 3, 1);
    });
  },
  howling_wolf: (ctx) => {
    sky(ctx, "#0c1230", "#2a3560");
    stars(ctx, 22, 14, 127);
    moon(ctx, 64, 10, 7, "#f0ecd8");
    moon(ctx, 61, 8, 1, "#d4cdb0");
    moon(ctx, 67, 13, 1, "#d4cdb0");
    const dark = "#070a14";
    // A crag climbing to its point, the wolf on it with its head back, and pines below
    for (let x = 0; x < W; x += 1) {
      const y = x < 54 ? 21 - Math.round(x * 0.16) : 22;
      px(ctx, dark, x, y, 1, H - y);
    }
    px(ctx, dark, 43, 10, 7, 2);
    px(ctx, dark, 43, 12, 1, 2);
    px(ctx, dark, 45, 12, 1, 2);
    px(ctx, dark, 48, 12, 1, 2);
    px(ctx, dark, 49, 8, 2, 3);
    px(ctx, dark, 50, 6, 2, 2);
    px(ctx, dark, 52, 4, 1, 2);
    px(ctx, dark, 49, 6);
    px(ctx, dark, 42, 9);
    px(ctx, dark, 41, 8);
    [62, 72, 80, 90].forEach((x, i) => {
      const tall = 5 + (i % 2) * 2;
      for (let r = 0; r < tall; r += 1) px(ctx, dark, x - Math.floor(r / 2), 22 - tall + r, 1 + 2 * Math.floor(r / 2), 1);
    });
  },
  witch_flight: (ctx) => {
    sky(ctx, "#1a0c34", "#5a2a6a");
    stars(ctx, 24, 16, 131);
    moon(ctx, 48, 12, 9, "#f4e6a8");
    moon(ctx, 44, 9, 2, "#e0cf88");
    const dark = "#0c0616";
    // Across the moon on her broom: bristles behind, cloak streaming, hat bent back
    px(ctx, dark, 41, 13, 17, 1);
    px(ctx, dark, 37, 12, 4, 3);
    px(ctx, dark, 36, 13, 1, 2);
    px(ctx, dark, 47, 9, 3, 4);
    px(ctx, dark, 50, 11, 2, 1);
    px(ctx, dark, 48, 7, 2, 2);
    px(ctx, dark, 46, 6, 5, 1);
    px(ctx, dark, 47, 5, 2, 1);
    px(ctx, dark, 46, 4, 2, 1);
    px(ctx, dark, 45, 3);
    px(ctx, dark, 44, 10, 3, 2);
    px(ctx, dark, 42, 11, 2, 1);
    // Cloud tops along the bottom
    for (let x = 0; x < W; x += 1) {
      const h = 3 + Math.round(1.5 * Math.sin((x * Math.PI * 2) / 24) + Math.sin((x * Math.PI * 2) / 16));
      px(ctx, "#2a163e", x, H - h, 1, h);
      px(ctx, "#3e2456", x, H - h);
    }
  },
  jack_o_lanterns: (ctx) => {
    sky(ctx, "#0c0806", "#241006");
    px(ctx, "#140a06", 0, 19, W, 5);
    // A row of them lit, faces taking turns: triangle eyes and a grin, round eyes and a gape
    for (let i = 0; i < 6; i += 1) {
      const x = 2 + i * 16;
      const glow = ctx.createRadialGradient(x + 6, 14, 2, x + 6, 14, 11);
      glow.addColorStop(0, "rgba(255,170,60,0.4)");
      glow.addColorStop(1, "rgba(255,140,40,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 5, 3, 22, 21);
      px(ctx, "#e8701a", x + 1, 8, 10, 12);
      px(ctx, "#e8701a", x, 10, 12, 8);
      px(ctx, "#ff9a3a", x + 2, 9, 1, 10);
      px(ctx, "#b44f0e", x + 9, 9, 1, 10);
      px(ctx, "#b44f0e", x + 5, 8, 1, 12);
      px(ctx, "#3f6b24", x + 5, 6, 2, 2);
      const lit = "#ffe066";
      if (i % 2 === 0) {
        px(ctx, lit, x + 2, 12, 3, 1);
        px(ctx, lit, x + 3, 11);
        px(ctx, lit, x + 7, 12, 3, 1);
        px(ctx, lit, x + 8, 11);
        px(ctx, lit, x + 2, 15, 8, 1);
        px(ctx, lit, x + 3, 16, 6, 1);
        px(ctx, "#e8701a", x + 4, 15);
        px(ctx, "#e8701a", x + 7, 16);
      } else {
        px(ctx, lit, x + 2, 11, 2, 2);
        px(ctx, lit, x + 8, 11, 2, 2);
        px(ctx, lit, x + 5, 13, 2, 1);
        px(ctx, lit, x + 4, 15, 4, 3);
        px(ctx, "#e8701a", x + 4, 15);
        px(ctx, "#e8701a", x + 7, 15);
      }
    }
  },
  ghost_parade: (ctx) => {
    sky(ctx, "#10142a", "#262c50");
    stars(ctx, 12, 6, 137);
    // Sheet ghosts in a line, every other one a little higher, over the mist
    for (let i = 0; i < 6; i += 1) {
      const x = 4 + i * 16;
      const y = i % 2 ? 6 : 8;
      px(ctx, "#eef2ff", x + 1, y, 6, 1);
      px(ctx, "#eef2ff", x, y + 1, 8, 8);
      px(ctx, "#c4cbe8", x + 7, y + 2, 1, 7);
      [0, 3, 6].forEach((dx) => px(ctx, "#eef2ff", x + dx, y + 9, 2, 1));
      px(ctx, "#c4cbe8", x + 6, y + 9, 2, 1);
      px(ctx, "#1a1a2c", x + 2, y + 3, 1, 2);
      px(ctx, "#1a1a2c", x + 5, y + 3, 1, 2);
      px(ctx, "#1a1a2c", x + 3, y + 6, 2, 1);
    }
    px(ctx, "rgba(200,210,240,0.16)", 0, 19, W, 2);
    px(ctx, "rgba(200,210,240,0.28)", 0, 21, W, 3);
  },
  scarecrow: (ctx) => {
    sky(ctx, "#d8502a", "#f8c860");
    moon(ctx, 22, 16, 5, "#fff0a0");
    const dark = "#1a0e06";
    px(ctx, "#2a1a08", 0, 18, W, 6);
    for (let x = 0; x < W; x += 3) px(ctx, "#3c2a0c", x, 15 + (x % 2), 1, 4);
    // On its pole, arms out, coat in rags, with the crows not at all scared
    px(ctx, dark, 56, 6, 1, 14);
    px(ctx, dark, 49, 9, 15, 1);
    px(ctx, dark, 55, 5, 3, 3);
    px(ctx, dark, 53, 4, 7, 1);
    px(ctx, dark, 55, 2, 3, 2);
    px(ctx, dark, 53, 10, 7, 4);
    [53, 55, 58].forEach((x) => px(ctx, dark, x, 14, 1, 2));
    px(ctx, dark, 49, 10, 1, 3);
    px(ctx, dark, 63, 10, 1, 2);
    px(ctx, dark, 61, 8, 2, 1);
    px(ctx, dark, 62, 7);
    [[10, 5], [36, 8], [78, 4], [88, 9]].forEach(([x, y]) => {
      px(ctx, dark, x, y);
      px(ctx, dark, x - 1, y - 1);
      px(ctx, dark, x + 1, y - 1);
      px(ctx, dark, x - 2, y);
      px(ctx, dark, x + 2, y);
    });
  },
  lighthouse: (ctx) => {
    sky(ctx, "#0a1226", "#1c2c4c");
    stars(ctx, 18, 10, 139);
    // The beam first (the tower stands in front of it), sweeping out to sea
    for (let k = 1; k < 62; k += 1) px(ctx, `rgba(255,232,144,${(0.34 * (1 - k / 62)).toFixed(3)})`, 66 - k, 5 - Math.round(k * 0.05), 1, 2 + Math.round(k * 0.14));
    px(ctx, "#0e2038", 0, 17, W, 7);
    const rand = seeded(149);
    for (let i = 0; i < 22; i += 1) px(ctx, "rgba(150,190,230,0.35)", rand() * (W - 4), 18 + rand() * 5, 2 + Math.floor(rand() * 3), 1);
    px(ctx, "#0a0c12", 62, 15, 12, 1);
    px(ctx, "#0a0c12", 60, 16, 16, 3);
    px(ctx, "#0a0c12", 58, 18, 20, 2);
    for (let y = 6; y < 16; y += 1) px(ctx, y % 4 < 2 ? "#e8e4d8" : "#c4322a", 66, y, 4, 1);
    px(ctx, "rgba(0,0,0,0.3)", 69, 6, 1, 10);
    px(ctx, "#20242c", 65, 6, 6, 1);
    px(ctx, "#ffe890", 66, 4, 4, 2);
    px(ctx, "#20242c", 66, 3, 4, 1);
    px(ctx, "#20242c", 67, 2, 2, 1);
  },
  city_rain: (ctx) => {
    sky(ctx, "#0e1020", "#2e2848");
    // The skyline, some windows still lit, and the rain coming down across it
    const rand = seeded(151);
    let x = 0;
    while (x < W) {
      const w = Math.min(5 + Math.floor(rand() * 6), W - x);
      const h = 8 + Math.floor(rand() * 13);
      px(ctx, "#0a0b14", x, H - h, w, h);
      px(ctx, "#161828", x, H - h, 1, h);
      for (let wy = H - h + 2; wy < H - 1; wy += 3)
        for (let wx = x + 1; wx < x + w - 1; wx += 2) if (rand() < 0.4) px(ctx, rand() < 0.75 ? "#ffd86a" : "#8ad0ff", wx, wy);
      if (rand() < 0.3 && w > 3) px(ctx, "#0a0b14", x + 2, H - h - 3, 1, 3);
      x += w;
    }
    for (let i = 0; i < 46; i += 1) px(ctx, "rgba(170,200,240,0.4)", rand() * W, rand() * (H - 2), 1, 2);
  },
  drive_in: (ctx) => {
    sky(ctx, "#140c2c", "#3a2048");
    stars(ctx, 22, 12, 157);
    px(ctx, "#0c0a10", 0, 19, W, 5);
    // The screen on its posts with tonight's creature feature up, and the cars parked in a
    // row, tail lights on
    px(ctx, "#20202a", 34, 3, 28, 13);
    px(ctx, "#dcdce8", 35, 4, 26, 11);
    px(ctx, "#20202a", 38, 16, 1, 3);
    px(ctx, "#20202a", 57, 16, 1, 3);
    px(ctx, "#2a2a3a", 44, 7, 8, 6);
    px(ctx, "#2a2a3a", 45, 6, 6, 1);
    px(ctx, "#2a2a3a", 42, 9, 2, 1);
    px(ctx, "#2a2a3a", 52, 9, 2, 1);
    px(ctx, "#2a2a3a", 41, 7, 1, 2);
    px(ctx, "#2a2a3a", 54, 7, 1, 2);
    px(ctx, "#2a2a3a", 45, 13, 2, 2);
    px(ctx, "#2a2a3a", 49, 13, 2, 2);
    px(ctx, "#dcdce8", 46, 8, 1, 2);
    px(ctx, "#dcdce8", 49, 8, 1, 2);
    px(ctx, "#dcdce8", 46, 11, 4, 1);
    [3, 15, 27, 40, 52, 65, 77, 88].forEach((x, i) => {
      px(ctx, i % 3 === 0 ? "#4a4460" : "#34304a", x, 21, 8, 2);
      px(ctx, i % 3 === 0 ? "#4a4460" : "#34304a", x + 2, 20, 4, 1);
      px(ctx, "#e43b3b", x, 21);
      px(ctx, "#e43b3b", x + 7, 21);
    });
  },
  big_top: (ctx) => {
    // The inside of the tent: red and cream stripes, and the valance along the top, scalloped,
    // with its gold stars
    for (let x = 0; x < W; x += 8) {
      const red = (x / 8) % 2 === 0;
      px(ctx, red ? "#c4322a" : "#f2e6c8", x, 0, 8, H);
      px(ctx, red ? "#9a2420" : "#d8c8a4", x + 7, 0, 1, H);
    }
    const shade = ctx.createLinearGradient(0, 0, 0, H);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(20,6,20,0.4)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, W, H);
    px(ctx, "#1d2a5a", 0, 0, W, 4);
    for (let x = 0; x < W; x += 1) px(ctx, "#1d2a5a", x, 4, 1, [1, 2, 3, 3, 3, 3, 2, 1][x % 8]);
    px(ctx, "#fbc02a", 0, 0, W, 1);
    for (let x = 3; x < W; x += 8) {
      px(ctx, "#fbc02a", x, 2, 2, 2);
      px(ctx, "#fbc02a", x, 6, 2, 1);
    }
  },
  catacombs: (ctx) => {
    sky(ctx, "#1a1410", "#0e0a08");
    // Skulls stacked to the roof, row on row, the odd one older and browner
    [1, 9, 17].forEach((y, row) => {
      for (let i = -1; i < 12; i += 1) {
        const x = i * 8 + (row % 2 ? 5 : 1);
        const bone = (i * 5 + row * 3) % 4 === 0 ? "#b8aa8c" : "#d8ccb0";
        px(ctx, bone, x + 1, y, 4, 1);
        px(ctx, bone, x, y + 1, 6, 3);
        px(ctx, bone, x + 1, y + 4, 4, 2);
        px(ctx, "#1a1410", x + 1, y + 2, 1, 2);
        px(ctx, "#1a1410", x + 4, y + 2, 1, 2);
        px(ctx, "#1a1410", x + 2, y + 5);
        px(ctx, "#1a1410", x + 3, y + 4);
        px(ctx, "rgba(0,0,0,0.25)", x + 5, y + 1, 1, 3);
      }
    });
  },
  eyes_in_the_dark: (ctx) => {
    sky(ctx, "#050308", "#0e0a16");
    // Something's in here with you. Several somethings: narrow eyes, round ones with slits
    const rand = seeded(163);
    const colours = ["#ffe23e", "#ff4a3a", "#7dff6a", "#e8e8ff"];
    for (let i = 0; i < 12; i += 1) {
      const x = 2 + i * 8 + Math.floor(rand() * 3);
      const y = 2 + Math.floor(rand() * 18);
      const colour = colours[Math.floor(rand() * colours.length)];
      if (rand() < 0.4) {
        px(ctx, colour, x, y, 2, 2);
        px(ctx, colour, x + 4, y, 2, 2);
        px(ctx, "#050308", x + 1, y, 1, 2);
        px(ctx, "#050308", x + 4, y, 1, 2);
      } else {
        px(ctx, colour, x, y, 2, 1);
        px(ctx, colour, x + 3, y, 2, 1);
      }
    }
  },
  ghost_ship: (ctx) => {
    sky(ctx, "#081416", "#1a3a38");
    stars(ctx, 12, 8, 167);
    moon(ctx, 18, 7, 4, "#c8f0d8");
    const dark = "#04100f";
    const sail = "rgba(140,255,200,0.5)";
    // A wreck still sailing: torn sails that glow, lamps lit below decks, fog on the water
    px(ctx, dark, 57, 4, 1, 13);
    px(ctx, dark, 66, 6, 1, 11);
    px(ctx, sail, 53, 6, 4, 5);
    px(ctx, sail, 58, 6, 5, 6);
    px(ctx, sail, 63, 8, 3, 5);
    px(ctx, sail, 67, 8, 5, 5);
    [[54, 9], [60, 8], [61, 11], [69, 10], [64, 12]].forEach(([x, y]) => px(ctx, "#10282a", x, y));
    px(ctx, dark, 58, 3, 3, 1);
    px(ctx, dark, 50, 15, 25, 3);
    px(ctx, dark, 49, 14, 3, 1);
    px(ctx, dark, 73, 14, 4, 1);
    px(ctx, dark, 77, 13, 2, 1);
    [54, 60, 68].forEach((x) => px(ctx, "#7dffb0", x, 16));
    px(ctx, "#0a2a2a", 0, 18, W, 6);
    const rand = seeded(173);
    for (let i = 0; i < 20; i += 1) px(ctx, "rgba(160,255,220,0.25)", rand() * (W - 4), 19 + rand() * 4, 2 + Math.floor(rand() * 3), 1);
    px(ctx, "rgba(180,240,220,0.14)", 0, 16, W, 3);
  },
  mad_lab: (ctx) => {
    sky(ctx, "#0c1410", "#1a2a22");
    px(ctx, "#3a2c1e", 0, 20, W, 2);
    px(ctx, "#241a10", 0, 22, W, 2);
    // Flasks along the bench, each brewing something worse, bubbles coming off them
    const colours = ["#7dff6a", "#b45cff", "#3ee0ff", "#ff5a7a", "#ffe23e"];
    const glass = "rgba(220,240,255,0.55)";
    [8, 26, 44, 62, 80].forEach((x, i) => {
      const colour = colours[i];
      const glow = ctx.createRadialGradient(x + 3.5, 15, 0, x + 3.5, 15, 9);
      glow.addColorStop(0, "rgba(255,255,255,0.22)");
      glow.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(x - 6, 5, 20, 15);
      if (i % 2 === 0) {
        // conical
        for (let r = 0; r < 7; r += 1) px(ctx, r < 2 ? glass : colour, x + 3 - Math.ceil(r / 2), 13 + r, 1 + 2 * Math.ceil(r / 2), 1);
        px(ctx, glass, x + 3, 8, 1, 5);
        px(ctx, glass, x + 2, 8, 3, 1);
      } else {
        // round-bottomed
        moon(ctx, x + 3, 16, 3, glass);
        px(ctx, colour, x + 1, 16, 5, 3);
        px(ctx, colour, x + 2, 19, 3, 1);
        px(ctx, glass, x + 3, 9, 1, 4);
        px(ctx, glass, x + 2, 9, 3, 1);
      }
      px(ctx, "rgba(255,255,255,0.7)", x + 2, 17);
      px(ctx, colour, x + 3, 6);
      px(ctx, colour, x + 4 - (i % 2) * 2, 4);
      px(ctx, colour, x + 3, 2 - (i % 2));
    });
  },
  cherry_blossoms: (ctx) => {
    sky(ctx, "#f4b8d0", "#fdeef2");
    // A bough along the top, in full flower, and the petals coming off it
    const bough = (x: number) => 5 + Math.round(2 * Math.sin((x * Math.PI * 4) / W));
    for (let x = 0; x < W; x += 1) {
      px(ctx, "#4a2c24", x, bough(x), 1, 2);
      if (x % 12 === 5) for (let k = 1; k < 6; k += 1) px(ctx, "#4a2c24", x + Math.floor(k / 2), bough(x) + 1 + k);
      if (x % 12 === 11) for (let k = 1; k < 4; k += 1) px(ctx, "#4a2c24", x - Math.floor(k / 2), bough(x) - k);
    }
    const rand = seeded(179);
    const pinks = ["#f48fb1", "#ffffff", "#e86a9a", "#fbd0e0"];
    for (let i = 0; i < 54; i += 1) {
      const x = Math.floor(rand() * (W - 2));
      const y = bough(x) - 4 + Math.floor(rand() * 10);
      px(ctx, pinks[Math.floor(rand() * pinks.length)], x, y, 2, 2);
      px(ctx, "#e86a9a", x + (i % 2), y + ((i >> 1) % 2));
    }
    for (let i = 0; i < 18; i += 1) px(ctx, rand() < 0.5 ? "#f48fb1" : "#e86a9a", rand() * W, 13 + rand() * 10);
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
  haunted_house: 36,
  northern_lights: 30,
  deep_space: 60,
  thunderstorm: 22,
  night_line: 62,
  bat_flight: 12,
  first_snow: 52,
  sunset_beach: 40,
  abduction: 40,
  fairy_ring: 40,
  eight_bit_evil: 40,
  howling_wolf: 42,
  witch_flight: 40,
  jack_o_lanterns: 16,
  ghost_parade: 16,
  scarecrow: 48,
  lighthouse: 60,
  drive_in: 40,
  ghost_ship: 55,
  mad_lab: 40,
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
