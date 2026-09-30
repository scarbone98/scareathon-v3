import { BoxGeometry, CanvasTexture, Color, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace } from "three";
import { canvasFont, TERMINAL_FONT, whenFontReady } from "./arcadeFonts.ts";
import {
  gameLines,
  gameTitle,
  LOADING_BLOCKS,
  loadingView,
  nowSeconds,
  PLAY_HINT,
  rebootView,
  takeoverView,
  terminalControls,
  typedParts,
  typeOut,
  type TerminalOptions,
  type TerminalScreen,
} from "./terminalScreen.ts";

// A little green-screen terminal beside the cartridge slot. It shows exactly
// what the info card does (the card is this terminal seen up close), laid out
// the same way: the heading, the pitch or details, the keys in the corners.

// The terminal's height as a share of its width
export const TERMINAL_ASPECT = 0.56;
// The glass's proportions (it's 84% of the case wide, 74% high), so nothing's
// stretched; sizes below are the card's CSS px scaled up by S
const WIDTH = 512;
const HEIGHT = Math.round((WIDTH * 0.74 * TERMINAL_ASPECT) / 0.84);
const S = 1.19;
const PHOSPHOR = "#39ff6a";
const GLASS = "#021407";

// Poked, it answers for a moment: a word, or a little picture in big pixels
const PICTURES: Record<string, string[]> = {
  heart: [
    ".XX...XX.",
    "XXXX.XXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
    "...XXX...",
    "....X....",
  ],
  thumbs: [
    "....XX...",
    "...XXX...",
    "...XX....",
    "XX.XXXXXX",
    "XX.XXXXXX",
    "XX.XXXXX.",
    "XX.XXXXX.",
    "XX..XXXX.",
  ],
  smile: [
    "..XXXXX..",
    ".X.....X.",
    "X..X.X..X",
    "X.......X",
    "X.X...X.X",
    "X..XXX..X",
    ".X.....X.",
    "..XXXXX..",
  ],
  star: [
    "....X....",
    "....X....",
    "...XXX...",
    "XXXXXXXXX",
    ".XXXXXXX.",
    "..XXXXX..",
    ".XX...XX.",
    "XX.....XX",
  ],
  ghost: [
    "..XXXXX..",
    ".XXXXXXX.",
    "XX..X..XX",
    "XX..X..XX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "XXXXXXXXX",
    "X.XX.XX.X",
  ],
  skull: [
    ".XXXXXXX.",
    "XXXXXXXXX",
    "X..XXX..X",
    "X..XXX..X",
    "XXXX.XXXX",
    ".XXXXXXX.",
    "..X.X.X..",
    "..XXXXX..",
  ],
};
const WORDS = ["HI!", "HELLO", "BEEP BOOP", "HEY THERE", "THAT TICKLES", "OW!", ":)", "<3", "STILL HERE", "PLAY ME", "BOO!", "*WHIRR*"];
const REACTION_TIME = 1.6; // seconds it answers for

export type SlotTerminal = {
  group: Group;
  // Poked: a word or a picture for a moment, then back to what it was showing
  react: (time: number) => void;
  show: (screen: TerminalScreen) => void;
  setOptions: (options: TerminalOptions) => void;
  update: (time: number) => void;
  dispose: () => void;
};

export function createSlotTerminal(width: number, height: number, depth: number): SlotTerminal {
  const group = new Group();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  // A beige case with a dark bezel round the glass
  const caseMaterial = new MeshStandardMaterial({ color: new Color("#b9ab8e"), roughness: 0.6 });
  const bezelMaterial = new MeshStandardMaterial({ color: new Color("#141114"), roughness: 0.4 });
  const glassMaterial = new MeshBasicMaterial({ map: texture });
  const caseGeometry = new BoxGeometry(width, height, depth);
  const bezelGeometry = new BoxGeometry(width * 0.9, height * 0.84, depth * 0.1);
  const glassGeometry = new PlaneGeometry(width * 0.84, height * 0.74);
  group.add(new Mesh(caseGeometry, caseMaterial));
  const bezel = new Mesh(bezelGeometry, bezelMaterial);
  bezel.position.z = depth / 2;
  group.add(bezel);
  const glass = new Mesh(glassGeometry, glassMaterial);
  glass.position.z = depth / 2 + depth * 0.06;
  group.add(glass);

  let screen: TerminalScreen = { kind: "message", lines: ["> INSERT CARTRIDGE"], at: nowSeconds() };
  let reaction: { word?: string; picture?: string[]; at: number } | null = null;
  let lastReaction = "";
  let options: TerminalOptions = { details: false, phone: false };
  let lastKey = "";
  whenFontReady(TERMINAL_FONT).then(() => {
    lastKey = "";
  });

  const font = (px: number) => canvasFont(TERMINAL_FONT, Math.round(px * S));
  // Rows, as on the card: the heading, the body, then the hint
  const top = (HEIGHT - (44 + 88 + 24) * S) / 2;
  const headingY = top + 22 * S;
  const bodyTop = top + 48 * S;
  const bodyMiddle = bodyTop + 44 * S;
  const hintY = top + 146 * S;

  const text = (value: string, x: number, y: number, align: CanvasTextAlign = "center") => {
    context.textAlign = align;
    context.fillText(value, x, y);
  };
  // A block cursor just after `value`, drawn at x with the given alignment
  const cursorAfter = (value: string, x: number, y: number, px: number, align: CanvasTextAlign = "center") => {
    const w = context.measureText(value).width;
    const end = align === "center" ? x + w / 2 : x + w;
    context.fillRect(end + 2, y - px * S * 0.42, px * S * 0.5, px * S * 0.85);
  };
  // The heading, shrunk to fit between the corner keys rather than wrapping
  const heading = (full: string, shown: string, cursor: boolean, cursorOn: boolean) => {
    const room = WIDTH - 2 * 22 * S;
    let px = 43;
    context.font = font(px);
    const w = context.measureText(full).width;
    if (w > room) {
      px *= room / w;
      context.font = font(px);
    }
    text(shown, WIDTH / 2, headingY);
    if (cursor && cursorOn) cursorAfter(shown, WIDTH / 2, headingY, px);
  };
  // Word-wrapped to at most `rows` lines
  const wrap = (value: string, maxWidth: number, rows: number) => {
    const lines: string[] = [];
    let line = "";
    for (const word of value.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.slice(0, rows);
  };
  const bar = (blocks: number, y: number) => {
    const w = (LOADING_BLOCKS * 16 + 4) * S;
    const x = (WIDTH - w) / 2;
    context.strokeStyle = PHOSPHOR;
    context.lineWidth = 2 * S;
    context.strokeRect(x, y - 10 * S, w, 20 * S);
    for (let i = 0; i < blocks; i += 1) context.fillRect(x + (4 + i * 16) * S, y - 6 * S, 12 * S, 12 * S);
  };
  // Each key draws from x on its `align` side and returns how wide it is
  const key = (label: string, x: number, y: number, align: CanvasTextAlign, lit = false) => {
    context.font = font(20);
    const value = `[ ${label} ]`;
    const w = context.measureText(value).width;
    if (lit) {
      const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
      context.fillRect(left - 3 * S, y - 12 * S, w + 6 * S, 24 * S);
      context.fillStyle = GLASS;
      text(value, x, y, align);
      context.fillStyle = PHOSPHOR;
    } else text(value, x, y, align);
    return w;
  };

  // A reaction fills the glass: the picture in big pixels (with a little bounce), or the word
  const paintReaction = (time: number) => {
    if (!reaction) return;
    const age = time - reaction.at;
    const frame = Math.floor(age * 12);
    const key = `reaction|${reaction.at}|${frame}`;
    if (key === lastKey) return;
    lastKey = key;
    context.fillStyle = GLASS;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = PHOSPHOR;
    context.shadowColor = PHOSPHOR;
    context.shadowBlur = 10;
    const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : age < 0.25 ? 1.1 - ((age - 0.15) / 0.1) * 0.1 : 1;
    const bob = Math.sin(age * 9) * 4 * S;
    if (reaction.picture) {
      const rows = reaction.picture.length;
      const cols = reaction.picture[0].length;
      const cell = Math.floor(((HEIGHT * 0.66) / rows) * pop);
      const x0 = (WIDTH - cols * cell) / 2;
      const y0 = (HEIGHT - rows * cell) / 2 + bob;
      reaction.picture.forEach((line, r) =>
        [...line].forEach((ch, c) => {
          if (ch === "X") context.fillRect(x0 + c * cell, y0 + r * cell, cell - 2, cell - 2);
        })
      );
    } else if (reaction.word) {
      let px = 64 * pop;
      context.font = font(px);
      const w = context.measureText(reaction.word).width;
      if (w > WIDTH * 0.86) {
        px *= (WIDTH * 0.86) / w;
        context.font = font(px);
      }
      context.textBaseline = "middle";
      text(reaction.word, WIDTH / 2, HEIGHT / 2 + bob);
    }
    context.shadowBlur = 0;
    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (let row = 0; row < HEIGHT; row += 3) context.fillRect(0, row, WIDTH, 1);
    texture.needsUpdate = true;
  };

  const paint = (time: number) => {
    if (reaction && time - reaction.at < REACTION_TIME) {
      paintReaction(time);
      return;
    }
    if (reaction) {
      reaction = null;
      lastKey = "";
    }
    const cursorOn = Math.floor(time * 2.5) % 2 === 0;
    const parts = typedParts(screen, options.details);
    const typing = typeOut(parts, screen, time);
    const loading = screen.kind === "loading" ? loadingView(screen, time) : null;
    const reboot = screen.kind === "reboot" ? rebootView(screen, time) : null;
    const takeover = screen.kind === "takeover" ? takeoverView(screen, time) : null;
    // Only redraw when something visible changed
    const state = `${screen.at}|${options.details}|${options.phone}|${typing.shown.join("|")}|${cursorOn}|${JSON.stringify(loading)}|${JSON.stringify(reboot)}|${JSON.stringify(takeover)}`;
    if (state === lastKey) return;
    lastKey = state;

    const glow = context.createRadialGradient(WIDTH / 2, HEIGHT / 2, 0, WIDTH / 2, HEIGHT / 2, WIDTH * 0.6);
    glow.addColorStop(0, "#06260f");
    glow.addColorStop(0.7, GLASS);
    glow.addColorStop(1, "#010a04");
    context.fillStyle = glow;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = PHOSPHOR;
    context.shadowColor = PHOSPHOR;
    context.shadowBlur = 6;
    context.textBaseline = "middle";

    if (screen.kind === "game" && options.details) {
      // The details have the glass to themselves (the other keys and the hint
      // hide): left-aligned as a block, the block centred
      context.font = font(20);
      const full = gameLines(screen.game, true);
      const left = Math.max((WIDTH - Math.max(...full.map((line) => context.measureText(line).width))) / 2, 20 * S);
      const middle = HEIGHT / 2;
      typing.shown.forEach((line, i) => {
        const y = middle + (i - (full.length - 1) / 2) * 24 * S;
        text(line, left, y, "left");
        const here = typing.done ? i === typing.shown.length - 1 : typing.cursorAt === i;
        if (cursorOn && here) cursorAfter(line, left, y, 20, "left");
      });
    } else if (screen.kind === "game") {
      const [shownName = "", ...shownLines] = typing.shown;
      heading(gameTitle(screen.game), shownName, typing.cursorAt === 0, cursorOn);
      context.font = font(20);
      const pitch = wrap(shownLines[0] ?? "", WIDTH - 2 * 20 * S, 2);
      pitch.forEach((line, i) => text(line, WIDTH / 2, bodyTop + (14 + i * 24) * S));
      if (cursorOn && typing.cursorAt === 1) {
        const last = Math.max(pitch.length - 1, 0);
        cursorAfter(pitch[last] ?? "", WIDTH / 2, bodyTop + (14 + last * 24) * S, 20);
      }
      if (screen.game.hasLeaderboard !== false) key("LEADERBOARD", WIDTH / 2, bodyTop + 72 * S, "center");
      else {
        context.globalAlpha = 0.6;
        text("NO SCORES KEPT", WIDTH / 2, bodyTop + 72 * S);
        context.globalAlpha = 1;
      }
    } else if (screen.kind === "message" || screen.kind === "code") {
      const [first = "", ...rest] = typing.shown;
      heading(screen.kind === "code" ? "> WAYSIDE OS" : (screen.lines[0] ?? ""), first, typing.cursorAt === 0, cursorOn);
      context.font = font(20);
      rest.forEach((line, i) => {
        const y = bodyMiddle + (i - (rest.length - 1) / 2) * 24 * S;
        text(line, WIDTH / 2, y);
        if (cursorOn && typing.cursorAt === i + 1) cursorAfter(line, WIDTH / 2, y, 20);
      });
    } else if (screen.kind === "loading" && loading) {
      const title = screen.title.replace(/[‘’]/g, "'").toUpperCase();
      heading(title, title, false, false);
      context.font = font(20);
      text(loading.label, WIDTH / 2, bodyMiddle - 16 * S);
      bar(loading.blocks, bodyMiddle + 16 * S);
    } else if (takeover) {
      if (takeover.off) {
        // Switched off: the glass dark, no glow
        context.fillStyle = "#010402";
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.fillStyle = PHOSPHOR;
        context.shadowBlur = 0;
      }
      if (takeover.inverted) {
        // The whole glass lit, the text dark
        context.fillRect(0, 0, WIDTH, HEIGHT);
        context.fillStyle = GLASS;
        context.shadowBlur = 0;
      }
      if (takeover.heading) heading(takeover.heading, takeover.heading, false, false);
      context.font = font(20);
      const rows = takeover.lines.length + (takeover.bar === null ? 0 : 1);
      takeover.lines.forEach((line, i) => {
        const y = bodyMiddle + (i - (rows - 1) / 2) * 24 * S;
        text(line, WIDTH / 2, y);
        if (takeover.cursor && i === takeover.lines.length - 1) cursorAfter(line, WIDTH / 2, y, 20);
      });
      if (takeover.bar !== null) bar(Math.round(takeover.bar * LOADING_BLOCKS), bodyMiddle + ((rows - 1) / 2) * 24 * S);
      if (takeover.cursor && takeover.lines.length === 0) cursorAfter("", WIDTH / 2, bodyMiddle, 20);
      context.fillStyle = PHOSPHOR;
    } else if (reboot) {
      if (reboot.crashed) {
        heading("*** FATAL ERROR ***", reboot.blink ? "*** FATAL ERROR ***" : "", false, false);
        context.font = font(20);
        text(reboot.faults[0], WIDTH / 2, bodyMiddle - 12 * S);
        text(reboot.faults[1], WIDTH / 2, bodyMiddle + 12 * S);
      } else {
        heading("> REBOOTING...", `> REBOOTING${reboot.dots}`, false, false);
        bar(reboot.blocks, bodyMiddle - 14 * S);
        context.font = font(20);
        text(reboot.check, WIDTH / 2, bodyMiddle + 22 * S);
      }
    }

    const controls = terminalControls(screen, options.details);
    if (!options.phone && controls === "all") {
      context.globalAlpha = 0.55;
      context.font = font(16);
      text(PLAY_HINT, WIDTH / 2, hintY);
      context.globalAlpha = 1;
    }
    // The keys, along the bottom: all the games (≡) on the left, ? on the right
    const row = HEIGHT - 11 * S;
    if (controls === "all") {
      key("≡", 5 * S, row, "left");
    }
    if (controls !== "none") key("?", WIDTH - 5 * S, row, "right", options.details);

    context.shadowBlur = 0;
    // Scanlines
    context.fillStyle = "rgba(0, 0, 0, 0.28)";
    for (let row = 0; row < HEIGHT; row += 3) context.fillRect(0, row, WIDTH, 1);
    texture.needsUpdate = true;
  };

  return {
    group,
    react(time) {
      // Never the same answer twice running
      const choices = [...Object.keys(PICTURES).map((name) => `#${name}`), ...WORDS].filter((choice) => choice !== lastReaction);
      const pick = choices[Math.floor(Math.random() * choices.length)];
      lastReaction = pick;
      reaction = pick.startsWith("#") ? { picture: PICTURES[pick.slice(1)], at: time } : { word: pick, at: time };
      lastKey = "";
    },
    show(next) {
      screen = next;
      lastKey = "";
    },
    setOptions(next) {
      options = next;
      lastKey = "";
    },
    update: paint,
    dispose() {
      texture.dispose();
      [caseMaterial, bezelMaterial, glassMaterial].forEach((material) => material.dispose());
      [caseGeometry, bezelGeometry, glassGeometry].forEach((geometry) => geometry.dispose());
    },
  };
}
