import type { MachineData } from "../Arcade/games.tsx";

// What the slot's little green-screen terminal shows. The info card is the same
// terminal seen up close, so both draw from this: the same screen, typed out at
// the same speed from the same moment.
export type TerminalScreen = { at: number } & (
  | { kind: "game"; game: MachineData } // the picked (or plugged-in) game
  | { kind: "message"; lines: string[] } // e.g. "> EJECT"; the first line is the heading
  | { kind: "loading"; title: string } // a cartridge on its way into the slot
  | { kind: "reboot"; seconds: number } // tapped till it crashed: a fault, then a reboot
  | { kind: "takeover" } // the "???" cartridge has the machine: logs, dumps and garbage, fast
);

// How the terminal is set up, apart from what it's showing
export type TerminalOptions = {
  details: boolean; // the ? key: a game's release, players and genre instead of its pitch
  phone: boolean; // the site menu key sits in the corner, and there's no keyboard hint
};

export const TERMINAL_CPS = 60; // characters typed a second
export const PLAY_HINT = "CLICK TWICE TO PLAY";
export const LOADING_BLOCKS = 14;
const LOADING_BLOCKS_PER_SECOND = 6;
const REBOOT_CRASH = 1.4; // seconds of fault report before the reboot starts
const REBOOT_CHECKS = ["MEM CHECK... OK", "TAPE DRIVE.. OK", "SCANNER..... OK"];

export const nowSeconds = () => performance.now() / 1000;

export const gameTitle = (game: MachineData) => game.name.replace(/[‘’]/g, "'").toUpperCase();

// The pitch; or with the ? key, the game's details, all in the same small type
export function gameLines(game: MachineData, details: boolean) {
  return details
    ? [
        ["TITLE", gameTitle(game)],
        ["GENRE", game.cartridge.about.genre],
        ["RELEASED", game.cartridge.about.released],
        ["PLAYERS", game.cartridge.about.players],
        ["SCORES", game.hasLeaderboard !== false ? "ON THE LEADERBOARD" : "NOT KEPT"],
        ["DEVELOPER", game.cartridge.about.developer],
      ].map(([label, value]) => `${label.padEnd(10)}${value.toUpperCase()}`)
    : [`> ${game.cartridge.tagline}`];
}

// The heading and lines that type out, in order (the details have no heading:
// the title's one of their lines)
export function typedParts(screen: TerminalScreen, details: boolean): string[] {
  if (screen.kind === "game") return details ? gameLines(screen.game, true) : [gameTitle(screen.game), ...gameLines(screen.game, false)];
  if (screen.kind === "message") return screen.lines;
  return [];
}

// `time` seconds in, how much of each part shows and which part the cursor sits in
export function typeOut(parts: string[], screen: TerminalScreen, time: number) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const typed = Math.min(Math.floor(Math.max(time - screen.at, 0) * TERMINAL_CPS), total);
  let left = typed;
  const shown = parts.map((part) => {
    const text = part.slice(0, Math.max(left, 0));
    left -= part.length;
    return text;
  });
  let before = 0;
  const cursorAt = Math.min(
    parts.findIndex((part) => (before += part.length) > typed),
    parts.length - 1
  );
  return { shown, cursorAt: cursorAt < 0 ? parts.length - 1 : cursorAt, done: typed >= total };
}

// The bar fills, with LOADING... over it, then holds at READY
export function loadingView(screen: TerminalScreen, time: number) {
  const blocks = Math.min(Math.floor(Math.max(time - screen.at, 0) * LOADING_BLOCKS_PER_SECOND), LOADING_BLOCKS);
  return { blocks, label: blocks >= LOADING_BLOCKS ? "READY" : `LOADING${".".repeat(Math.floor(time * 3) % 4)}` };
}

// The crash: a blinking fault report, then REBOOTING with a filling bar and the
// latest self-check passed
export function rebootView(screen: TerminalScreen & { kind: "reboot" }, time: number) {
  const elapsed = Math.max(time - screen.at, 0);
  const progress = Math.min(Math.max((elapsed - REBOOT_CRASH) / (screen.seconds - REBOOT_CRASH - 0.3), 0), 1);
  const passed = REBOOT_CHECKS.filter((_, i) => progress > 0.3 * (i + 1));
  return {
    crashed: elapsed < REBOOT_CRASH,
    blink: Math.floor(time * 4) % 2 === 0,
    dots: ".".repeat(Math.floor(time * 3) % 4),
    blocks: Math.floor(progress * LOADING_BLOCKS),
    check: passed[passed.length - 1] ?? "",
  };
}

// The takeover: the "???" cartridge at work on the machine, like someone at the
// keyboard going fast. It jumps between bursts: commands typed at the prompt,
// logs scrolling past, memory dumps, progress bars, and the odd moment at an
// empty prompt; now and then a burst of garbage, or one lit up inverted; and
// sometimes it goes quiet, sitting at an empty prompt or seeming to switch off
// for a while. Bursts run anywhere from a fraction of a second to half a
// minute, and about a third have no heading. Everything is worked out from the
// time, so the slot terminal and the info card show the same thing.
const TAKEOVER_TASKS = ["> DIAG", "> MEM DUMP", "> FLASH ROM", "> PATCH", "> COPY", "> BUILD", "> VERIFY", "> SCAN", "> DECOMP", "> LINK"];
const TAKEOVER_COMMANDS = [
  "dump 0x4000 64", "patch 0x3f2a 4e", "copy bank2 bank5", "verify rom", "flash rom -f", "mount tape0",
  "ls /sys", "run diag", "make boot.img", "cat /sys/irq", "scan port1", "load seg07", "set irq 5", "sync",
];
const GARBAGE = "▓▒░#@%&?!/<>0123456789ABCDEF";
// `off`: the terminal looks switched off (dark glass, nothing on it)
export type TakeoverView = { heading: string; lines: string[]; bar: number | null; inverted: boolean; cursor: boolean; off?: boolean };

function hashed(n: number) {
  let t = ((n + 1) * 0x9e3779b1) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
}
function pick<T>(list: T[], n: number) {
  return list[Math.floor(hashed(n) * list.length)];
}
// Some of a line's characters swapped for garbage
function corrupt(text: string, amount: number, n: number) {
  return [...text].map((c, i) => (c !== " " && hashed(n * 131 + i) < amount ? GARBAGE[Math.floor(hashed(n * 71 + i) * GARBAGE.length)] : c)).join("");
}
function garbage(length: number, n: number) {
  return Array.from({ length }, (_, i) => (hashed(n * 53 + i) < 0.2 ? " " : GARBAGE[Math.floor(hashed(n * 29 + i) * GARBAGE.length)])).join("");
}
const hex = (n: number) => Math.floor(hashed(n) * 256).toString(16).toUpperCase().padStart(2, "0");
const hex4 = (n: number) => `0x${hex(n)}${hex(n + 1)}`;
const digit = (n: number, max: number) => 1 + Math.floor(hashed(n) * max);

// One line of busy output, different for every n
function logLine(n: number) {
  const lines = [
    () => `READ SECTOR ${hex4(n)} .. OK`,
    () => `WRITE ${digit(n, 64) * 16} BYTES @${hex4(n + 3)}`,
    () => `VERIFY ${hex4(n)} CRC ${hex(n + 5)}${hex(n + 6)}`,
    () => `PATCH ${hex4(n)} ${hex(n + 2)}->${hex(n + 4)}`,
    () => `COPY BANK ${digit(n, 7)} -> BANK ${digit(n + 1, 7)}`,
    () => `SEEK TRACK ${digit(n, 40)}`,
    () => `LINK SEG_${String(digit(n, 32)).padStart(2, "0")}.OBJ`,
    () => `SET IRQ ${digit(n, 7)}`,
    () => "FLUSH CACHE .. OK",
    () => `JMP ${hex4(n)}`,
    () => `DECOMP SEG ${digit(n, 20)} .. ${digit(n + 1, 99)}%`,
    () => "CALIBRATE SCANNER .. OK",
    () => `RETRY ${digit(n, 2)}/3 .. OK`,
    () => `MOUNT TAPE${digit(n, 3) - 1}`,
    () => `LOAD ${hex4(n)}-${hex4(n + 9)}`,
  ];
  return lines[Math.floor(hashed(n * 19) * lines.length)]();
}

export function takeoverView(screen: TerminalScreen, time: number): TakeoverView {
  const elapsed = Math.max(time - screen.at, 0);
  // Bursts of very different lengths: about half under a second and a half,
  // some a few seconds, some up to fifteen, and now and then a hold of up to
  // half a minute. Garbage and pauses stay short; quiet spells at the prompt or
  // switched off run a few seconds or more. Found by walking along from the start.
  const kindOf = (n: number) =>
    n === 0 ? "command" : pick(["log", "log", "command", "command", "hex", "bar", "bar", "garbage", "pause", "idle", "off"], n * 13);
  const lengthOf = (n: number) => {
    const h = hashed(n * 7 + 1);
    const kind = kindOf(n);
    if (kind === "pause") return 0.2 + h * 0.6;
    if (kind === "garbage") return 0.15 + h * 0.45;
    if (kind === "idle") return 3 + h * 10;
    if (kind === "off") return 1 + h * 7;
    const roll = hashed(n * 23 + 2);
    if (roll < 0.5) return 0.3 + h * 1.2;
    if (roll < 0.8) return 1.5 + h * 4;
    if (roll < 0.94) return 6 + h * 9;
    return 15 + h * 15;
  };
  let burst = 0;
  let start = 0;
  for (;;) {
    const length = lengthOf(burst);
    if (elapsed < start + length) break;
    start += length;
    burst += 1;
  }
  const length = lengthOf(burst);
  const t = elapsed - start;
  const tick = Math.floor(elapsed * 20); // twenty changes a second
  const kind = kindOf(burst);
  // About a third of bursts have no heading
  const task = hashed(burst * 41) < 0.33 ? "" : pick(TAKEOVER_TASKS, burst * 3);
  const heading = kind === "garbage" ? corrupt(task || pick(TAKEOVER_TASKS, burst * 3), 0.6, tick) : task;
  // Now and then a short burst comes up inverted
  const inverted = burst > 1 && !["pause", "idle", "off"].includes(kind) && length < 2 && hashed(burst * 17) < 0.1;
  switch (kind) {
    case "command": {
      // Commands typed fast at the prompt, one after another, each with a line of output
      const every = 1.1 + hashed(burst * 3 + 7) * 0.8;
      const which = Math.floor(t / every);
      const at = t - which * every;
      const command = pick(TAKEOVER_COMMANDS, burst * 5 + which);
      const typed = Math.floor(at * 28);
      const done = typed > command.length + 3;
      const lines = [logLine(burst * 31 + which * 2 - 1), `$ ${command.slice(0, typed)}`];
      if (done) lines.push(logLine(burst * 31 + which * 2));
      return { heading, lines, bar: null, inverted, cursor: !done };
    }
    case "hex": {
      const address = Math.floor(hashed(burst) * 0xfff0) + tick * 8;
      const lines = [0, 1, 2].map((r) => {
        const at = (address + r * 8) & 0xffff;
        return `${at.toString(16).toUpperCase().padStart(4, "0")}  ${[0, 1, 2, 3, 4, 5].map((b) => hex(at * 8 + b)).join(" ")}`;
      });
      return { heading, lines, bar: null, inverted, cursor: false };
    }
    case "bar": {
      // A job filling its bar over the burst, a little unevenly; most finish
      const target = hashed(burst * 5) < 0.6 ? 1 : 0.3 + hashed(burst * 9) * 0.6;
      const wobble = (hashed(tick) - 0.5) * 0.03;
      const fill = Math.max(0, Math.min((t / (length * 0.85)) * target + wobble, target));
      return { heading, lines: [logLine(burst * 11), `${Math.round(fill * 100)}%`], bar: fill, inverted, cursor: false };
    }
    case "garbage":
      return { heading, lines: [0, 1, 2].map((r) => garbage(22, tick * 3 + r)), bar: null, inverted, cursor: false };
    case "pause":
      return { heading, lines: ["$ "], bar: null, inverted: false, cursor: Math.floor(time * 2.5) % 2 === 0 };
    case "idle":
      // Nobody typing for a while: an empty prompt, the cursor blinking
      return { heading: "", lines: ["$ "], bar: null, inverted: false, cursor: Math.floor(time * 2.5) % 2 === 0 };
    case "off":
      return { heading: "", lines: [], bar: null, inverted: false, cursor: false, off: true };
    default: {
      // Output scrolling up at this burst's own pace, the newest line printing
      const rate = 3 + hashed(burst * 29) * 9;
      const step = Math.floor(t * rate);
      const lines = [2, 1, 0].map((back) => {
        const line = logLine(burst * 97 + step - back);
        return back === 0 ? line.slice(0, Math.ceil((t * rate - step) * line.length * 2)) : line;
      });
      return { heading, lines, bar: null, inverted, cursor: true };
    }
  }
}

// Which keys (and the hint) show: all of them on a game's screen; only ? over its
// details, to put them away; none while the terminal's busy (loading, ejecting,
// rebooting, waiting for a cartridge)
export function terminalControls(screen: TerminalScreen, details: boolean): "all" | "details" | "none" {
  if (screen.kind !== "game") return "none";
  return details ? "details" : "all";
}

// Whether the screen has stopped changing (so there's nothing more to redraw)
export function settled(screen: TerminalScreen, details: boolean, time: number) {
  if (screen.kind === "reboot" || screen.kind === "takeover") return false;
  if (screen.kind === "loading") return loadingView(screen, time).blocks >= LOADING_BLOCKS;
  return typeOut(typedParts(screen, details), screen, time).done;
}
