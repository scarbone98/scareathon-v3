// What the "???" cartridge shows once it's plugged in: strange scenes cut
// together live, in a random order and for random lengths. Mostly glimpses of
// a few frames, some a second or so, now and then one that holds for several
// seconds, and rarely one that stays up for as long as a minute. A few cuts
// are bright (a white flash, an inverted frame); they're kept short and at
// least BRIGHT_GAP apart, well under three flashes a second.
//
// Scenes are drawn on a 960x540 stage, scaled to fit the cabinet's screen.

const STAGE_W = 960;
const STAGE_H = 540;
const GOLD = "#e9c46a";
const PALE = "#e8e4f4";
const INK = "#06040b";
const BRIGHT_GAP = 0.5; // seconds between bright cuts, at least
const FRAME_RATE = 30;

type Scene =
  | "dark" | "stars" | "flash" | "wheel" | "figure" | "waves" | "runes" | "negative" | "eye"
  | "eclipse" | "pillars" | "approach" | "tunnel" | "spiral" | "words" | "print" | "crack" | "orbs" | "kaleido";
const SCENES: Scene[] = [
  "dark", "stars", "flash", "wheel", "figure", "waves", "runes", "negative", "eye",
  "eclipse", "pillars", "approach", "tunnel", "spiral", "words", "print", "crack", "orbs", "kaleido",
];
const BRIGHT: Scene[] = ["flash", "negative"];
// Only ever glimpsed
const SHORT_ONLY: Scene[] = ["flash", "negative", "figure", "crack"];
const WORDS = ["IT WAS HERE FIRST", "BEFORE THE FIRST LIGHT", "DO YOU HEAR IT", "IT REMEMBERS YOU", "NOT YET", "LOOK UP"];

// A small seeded random, so a cut draws the same thing every frame it's up
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cutLength(scene: Scene) {
  if (BRIGHT.includes(scene)) return 0.1 + Math.random() * 0.07;
  const roll = Math.random();
  if (SHORT_ONLY.includes(scene) || roll < 0.5) return 0.1 + Math.random() * 0.25;
  if (roll < 0.78) return 0.6 + Math.random() * 0.9;
  if (roll < 0.93) return 2.5 + Math.random() * 5.5;
  return 10 + Math.random() * 50;
}

type Cut = { scene: Scene; start: number; length: number; seed: number };

export function createMysteryScreen(labelUrl: string) {
  // The label's scratched print, for the scene that flickers it up on screen
  const print = new Image();
  print.src = labelUrl;

  const starRandom = seeded(7);
  const stars = Array.from({ length: 260 }, () => ({ angle: starRandom() * Math.PI * 2, phase: starRandom(), speed: 0.4 + starRandom() * 1.2 }));
  const glyphs = Array.from({ length: 40 }, () =>
    Array.from({ length: 2 + Math.floor(starRandom() * 3) }, () => [starRandom(), starRandom(), starRandom(), starRandom()])
  );

  let cut: Cut = { scene: "dark", start: 0, length: 1.3, seed: 1 };
  let lastBright = -Infinity;
  let lastFrame = -1;

  const nextCut = (time: number) => {
    let scene: Scene;
    do {
      scene = SCENES[Math.floor(Math.random() * SCENES.length)];
    } while (scene === cut.scene || (BRIGHT.includes(scene) && time - lastBright < BRIGHT_GAP));
    if (BRIGHT.includes(scene)) lastBright = time;
    cut = { scene, start: time, length: cutLength(scene), seed: Math.floor(Math.random() * 1e9) };
  };

  // Plugged in again: start from the dark
  const reset = (time: number) => {
    cut = { scene: "dark", start: time, length: 1.3, seed: 1 };
    lastFrame = -1;
  };

  // Paints the current frame; returns false when nothing changed (between frames)
  const paint = (context: CanvasRenderingContext2D, time: number) => {
    const frame = Math.floor(time * FRAME_RATE);
    if (frame === lastFrame) return false;
    lastFrame = frame;
    while (time - cut.start >= cut.length) {
      const end = cut.start + cut.length;
      nextCut(end);
      if (time - cut.start > 5) cut.start = time; // been away (tab hidden): just carry on from now
    }
    const { width, height } = context.canvas;
    const scale = Math.min(width / STAGE_W, height / STAGE_H);
    context.save();
    context.setTransform(scale, 0, 0, scale, (width - STAGE_W * scale) / 2, (height - STAGE_H * scale) / 2);
    const t = time - cut.start; // seconds into the cut
    const u = Math.min(t / cut.length, 1); // how far through it
    drawScene(context, cut.scene, t, u, cut.length, seeded(cut.seed), time);
    grain(context, 0.06);
    context.restore();
    context.fillStyle = "rgba(0, 0, 0, 0.22)";
    for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 2);
    return true;
  };

  // --- Drawing --------------------------------------------------------------------------

  const bg = (c: CanvasRenderingContext2D, color: string) => {
    c.fillStyle = color;
    c.fillRect(-200, -200, STAGE_W + 400, STAGE_H + 400);
  };
  const line = (c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, width: number) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  };
  const circle = (c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) => {
    c.fillStyle = color;
    c.beginPath();
    c.arc(x, y, Math.max(r, 0), 0, Math.PI * 2);
    c.fill();
  };
  const ring = (c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, width: number) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.beginPath();
    c.arc(x, y, Math.max(r, 0), 0, Math.PI * 2);
    c.stroke();
  };
  const polygon = (c: CanvasRenderingContext2D, points: number[][], color: string) => {
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  };
  const grain = (c: CanvasRenderingContext2D, alpha: number) => {
    for (let i = 0; i < 300; i += 1) {
      c.fillStyle = `rgba(255, 255, 255, ${Math.random() * alpha})`;
      c.fillRect(Math.random() * STAGE_W, Math.random() * STAGE_H, 3, 3);
    }
  };
  const withAlpha = (c: CanvasRenderingContext2D, alpha: number, draw: () => void) => {
    const before = c.globalAlpha;
    c.globalAlpha = before * alpha;
    draw();
    c.globalAlpha = before;
  };

  const drawStars = (c: CanvasRenderingContext2D, time: number, alpha: number) => {
    c.lineCap = "round";
    for (const star of stars) {
      const d = (star.phase + time * 0.5 * star.speed) % 1;
      const dx = Math.cos(star.angle);
      const dy = Math.sin(star.angle);
      const r0 = d ** 2.2 * 700;
      const r1 = r0 + 6 + d * 60 * star.speed;
      withAlpha(c, alpha * d, () => line(c, 480 + dx * r0, 270 + dy * r0, 480 + dx * r1, 270 + dy * r1, PALE, 1 + d * 2));
    }
  };

  const rays = (c: CanvasRenderingContext2D, x: number, y: number, turn: number, alpha: number) => {
    for (let i = 0; i < 16; i += 1) {
      const a = turn + (i * Math.PI * 2) / 16;
      withAlpha(c, alpha * (i % 2 ? 1 : 0.5), () =>
        polygon(c, [[x, y], [x + Math.cos(a - 0.05) * 700, y + Math.sin(a - 0.05) * 700], [x + Math.cos(a + 0.05) * 700, y + Math.sin(a + 0.05) * 700]], GOLD)
      );
    }
  };

  // The wheel: a ring with twelve jewels and four long spokes
  const wheel = (c: CanvasRenderingContext2D, x: number, y: number, r: number, turn: number, color: string, alpha: number) => {
    withAlpha(c, alpha, () => {
      ring(c, x, y, r, color, 7);
      withAlpha(c, 0.5, () => ring(c, x, y, r * 0.9, color, 2));
      for (let i = 0; i < 12; i += 1) {
        const a = turn + (i * Math.PI * 2) / 12;
        circle(c, x + Math.cos(a) * r, y + Math.sin(a) * r, i % 3 === 0 ? 9 : 5, color);
      }
      for (let i = 0; i < 4; i += 1) {
        const a = turn * 0.5 + (i * Math.PI) / 2 + Math.PI / 4;
        line(c, x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, color, 5);
      }
    });
  };

  // A tall pale robed figure with a long neck and swept-back blades for arms
  const figure = (c: CanvasRenderingContext2D, x: number, y: number, s: number, color: string, alpha: number) => {
    const at = (points: number[][]) => points.map(([px, py]) => [x + px * s, y + py * s]);
    withAlpha(c, alpha, () => {
      polygon(c, at([[-12, -60], [12, -60], [55, 40], [85, 150], [0, 130], [-85, 150], [-55, 40]]), color);
      polygon(c, at([[-8, -130], [8, -130], [14, -58], [-14, -58]]), color);
      for (const side of [-1, 1]) polygon(c, at([[12 * side, -45], [160 * side, -120], [175 * side, -108], [45 * side, 5]]), color);
      circle(c, x, y - 150 * s, 24 * s, color);
      circle(c, x, y - 152 * s, 5 * s, "#ff5a33");
    });
  };

  const eye = (c: CanvasRenderingContext2D, open: number) => {
    const half = 90 * open;
    c.beginPath();
    for (let i = 0; i <= 48; i += 1) {
      const a = i / 48;
      const px = 220 + a * 520;
      const py = 270 - half * Math.sin(Math.PI * a);
      if (i) c.lineTo(px, py);
      else c.moveTo(px, py);
    }
    for (let i = 48; i >= 0; i -= 1) {
      const a = i / 48;
      c.lineTo(220 + a * 520, 270 + half * Math.sin(Math.PI * a));
    }
    c.closePath();
    if (open > 0.02) {
      c.fillStyle = PALE;
      c.fill();
      c.save();
      c.clip();
      circle(c, 480, 270, 70 * Math.max(open, 0.6), GOLD);
      circle(c, 480, 270, 30 * Math.max(open, 0.6), INK);
      circle(c, 468, 256, 8, "rgba(255, 255, 255, 0.9)");
      c.restore();
    }
    c.strokeStyle = PALE;
    c.lineWidth = 3;
    c.stroke();
  };

  const drawScene = (c: CanvasRenderingContext2D, scene: Scene, t: number, u: number, length: number, random: () => number, time: number) => {
    const variant = Math.floor(random() * 100);
    c.lineCap = "round";
    c.lineJoin = "round";
    switch (scene) {
      case "dark":
        bg(c, INK);
        withAlpha(c, 0.3 + 0.7 * u, () => circle(c, 480, 270, 2 + 3 * u, PALE));
        break;
      case "stars":
        bg(c, "#0a0716");
        drawStars(c, time, 1);
        break;
      case "flash": {
        // White fading to dark violet
        const k = Math.round(255 - 229 * u);
        bg(c, `rgb(${k}, ${Math.round(247 - 231 * u)}, ${Math.round(230 - 182 * u)})`);
        break;
      }
      case "wheel":
        bg(c, INK);
        rays(c, 480, 270, time * 0.2, 0.25);
        wheel(c, 480, 270, 200 + 30 * Math.sin(t * 0.8), time * 0.8, GOLD, 1);
        break;
      case "figure":
        bg(c, INK);
        wheel(c, 480, 270, 230, 0.3, GOLD, 0.35);
        figure(c, 480, 281, 1.35, PALE, 1);
        break;
      case "negative":
        bg(c, PALE);
        wheel(c, 480, 270, 220, time, INK, 1);
        figure(c, 480, 281, 1.35, INK, 1);
        break;
      case "waves":
        bg(c, INK);
        for (let k = 0; k < 6; k += 1) {
          const r = (t * 180 + k * 100) % 600;
          withAlpha(c, 1 - r / 600, () => ring(c, 480, 270, r, GOLD, 4));
        }
        circle(c, 480, 270, 10, "rgba(255, 255, 255, 0.9)");
        break;
      case "runes": {
        bg(c, "#0b0714");
        const step = Math.floor(t * 3);
        for (let y = 0; y < 7; y += 1) {
          for (let x = 0; x < 10; x += 1) {
            const g = glyphs[(x * 7 + y * 3 + step + variant) % glyphs.length];
            const ox = x * 96 + 20;
            const oy = y * 96 + 12 - ((t * 12) % 96);
            const lit = (x + y + Math.floor(t * 5)) % 5 === 0 ? 1 : 0.25;
            withAlpha(c, lit, () => g.forEach(([a, b, d, e]) => line(c, ox + a * 56, oy + b * 56, ox + d * 56, oy + e * 56, GOLD, 3)));
          }
        }
        break;
      }
      case "eye": {
        bg(c, INK);
        // Opens over a second or so, then blinks now and then
        const opening = Math.min(t / Math.min(1.2, length * 0.6), 1);
        const blink = length > 2 && t % 4.5 > 4.3 ? 0 : 1;
        eye(c, opening * blink);
        break;
      }
      case "eclipse": {
        bg(c, INK);
        const r = 120 + 40 * Math.min(t / 20, 1);
        for (let i = 0; i < 18; i += 1) {
          withAlpha(c, 0.05 * (1 - i / 18) * (0.8 + 0.2 * Math.sin(t * 3)), () => circle(c, 480, 270, r + 8 + i * 9, GOLD));
        }
        withAlpha(c, 0.9, () => ring(c, 480, 270, r + 3, "#fff2cc", 3));
        circle(c, 480, 270, r, INK);
        break;
      }
      case "pillars": {
        bg(c, "#0b0918");
        drawStars(c, time * 0.3, 0.5);
        c.fillStyle = "#05030a";
        c.fillRect(-200, STAGE_H * 0.62, STAGE_W + 400, STAGE_H);
        for (let i = 0; i < 10; i += 1) {
          c.fillStyle = `rgba(128, 90, 205, ${0.06 - i * 0.006})`;
          c.fillRect(-200, STAGE_H * 0.62 - i * 6, STAGE_W + 400, 6);
        }
        for (let i = 0; i < 9; i += 1) {
          const x = ((((i * 150 - t * 18 + variant * 7) % 1050) + 1050) % 1050) - 75;
          const top = STAGE_H * (0.18 + (0.2 * ((i * 37 + variant) % 5)) / 5);
          c.fillStyle = "#05030a";
          c.fillRect(x, top, 46, STAGE_H * 0.62 - top);
          polygon(c, [[x - 6, top], [x + 52, top], [x + 30, top - 18], [x + 8, top - 6]], "#05030a");
        }
        break;
      }
      case "approach": {
        // Something far off, coming closer the whole time it's up
        bg(c, INK);
        const s = 0.15 + 0.75 * u * u;
        wheel(c, 480, 270, 230 * s, time * 0.2, GOLD, 0.2);
        figure(c, 480, 270, s * 1.3, PALE, 0.3 + 0.5 * u);
        break;
      }
      case "tunnel": {
        bg(c, INK);
        const sides = 6 + (variant % 3);
        for (let k = 0; k < 14; k += 1) {
          const d = (k / 14 + t * 0.35) % 1;
          const r = d ** 3 * 900;
          c.beginPath();
          for (let j = 0; j <= sides; j += 1) {
            const a = (j * Math.PI * 2) / sides + t * 0.3;
            const px = 480 + Math.cos(a) * r;
            const py = 270 + Math.sin(a) * r;
            if (j) c.lineTo(px, py);
            else c.moveTo(px, py);
          }
          c.strokeStyle = GOLD;
          c.lineWidth = 2 + d * 4;
          withAlpha(c, d, () => c.stroke());
        }
        break;
      }
      case "spiral":
        bg(c, "#09060f");
        for (let arm = 0; arm < 5; arm += 1) {
          c.beginPath();
          for (let j = 0; j < 80; j += 1) {
            const a = j * 0.12 + (arm * Math.PI * 2) / 5 - t * 1.2;
            const px = 480 + Math.cos(a) * j * 7;
            const py = 270 + Math.sin(a) * j * 7;
            if (j) c.lineTo(px, py);
            else c.moveTo(px, py);
          }
          c.strokeStyle = GOLD;
          c.lineWidth = 3;
          withAlpha(c, 0.8, () => c.stroke());
        }
        break;
      case "words": {
        bg(c, INK);
        const text = WORDS[variant % WORDS.length];
        const shown = text.slice(0, Math.floor(t * 14));
        c.font = "700 34px ui-monospace, Menlo, Consolas, monospace";
        c.textBaseline = "middle";
        c.textAlign = "left";
        const left = (STAGE_W - c.measureText(text).width) / 2;
        c.fillStyle = PALE;
        c.fillText(shown, left, 270);
        if (Math.floor(t * 2.5) % 2 === 0) c.fillRect(left + c.measureText(shown).width + 4, 254, 16, 32);
        break;
      }
      case "print": {
        bg(c, "#120d18");
        if (print.complete && print.naturalWidth) {
          const s = Math.max(STAGE_W / print.naturalWidth, STAGE_H / print.naturalHeight);
          const jx = (Math.random() - 0.5) * 12;
          const jy = (Math.random() - 0.5) * 8;
          c.drawImage(print, (STAGE_W - print.naturalWidth * s) / 2 + jx, (STAGE_H - print.naturalHeight * s) / 2 + jy, print.naturalWidth * s, print.naturalHeight * s);
        }
        break;
      }
      case "crack": {
        bg(c, INK);
        let x = 480;
        let y = 0;
        const reach = STAGE_H * Math.min(u * 1.6, 1);
        while (y < reach) {
          const nx = x + (random() - 0.5) * 80;
          const ny = y + 20 + random() * 30;
          withAlpha(c, 0.35, () => line(c, x, y, nx, ny, GOLD, 12));
          line(c, x, y, nx, ny, "rgba(255, 255, 255, 0.95)", 3);
          x = nx;
          y = ny;
        }
        break;
      }
      case "orbs": {
        bg(c, "#07050d");
        circle(c, 480, 270, 14, "rgba(232, 228, 244, 0.8)");
        ["#e05a6a", "#5a8ae0", "#c9c2a8"].forEach((tint, i) => {
          const a = t * 0.9 + (i * Math.PI * 2) / 3;
          const x = 480 + Math.cos(a) * 250;
          const y = 270 + Math.sin(a) * 90;
          for (let g = 0; g < 6; g += 1) withAlpha(c, 0.06, () => circle(c, x, y, 34 + g * 8, tint));
          circle(c, x, y, 30, tint);
        });
        break;
      }
      case "kaleido": {
        bg(c, INK);
        const spin = t * 0.6 * (variant % 2 ? 1 : -1);
        for (let i = 0; i < 12; i += 1) {
          const a = (i * Math.PI * 2) / 12 + spin;
          withAlpha(c, 0.5, () =>
            polygon(c, [[480, 270], [480 + Math.cos(a) * 420, 270 + Math.sin(a) * 420], [480 + Math.cos(a + 0.22) * 300, 270 + Math.sin(a + 0.22) * 300]], i % 2 ? GOLD : "#6b4fc4")
          );
        }
        break;
      }
    }
  };

  return { paint, reset };
}
