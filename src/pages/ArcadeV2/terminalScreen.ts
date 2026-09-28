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

// The takeover: the "???" cartridge running the terminal. It jumps between
// bursts (scrolling logs, hex dumps, bars racing to nowhere, garbage, and the
// odd pause with only a cursor), each a fraction of a second to a second or so.
// Everything is worked out from the time, so the slot terminal and the info card
// show the same thing.
const TAKEOVER_HEADINGS = ["> ??????", "> CARTRIDGE", "> IT'S IN", "> NOT YOURS", "> ERR 0x0000", "> SA-86 v?.?", "> HELLO", "> WAKING"];
const TAKEOVER_LOG = [
  "OVERWRITING BIOS", "CONTROL TRANSFERRED", "SCANNER: NO SIGNAL", "UNKNOWN DEVICE ON PORT 1",
  "SA-86 KERNEL.. GONE", "PROCESS 00: ???", "COPYING MEMORY", "ACCESS GRANTED", "WHO IS THERE",
  "LISTENING", "REWRITING TAPE DRIVE", "OPENING PORT 3", "WRITING SECTOR 0x0000", "IT REMEMBERS",
  "DO NOT REMOVE", "CLOCK: -01:00:00", "LOADING ?????", "DECODING", "RUNNING 'OURS'", "FOUND YOU",
];
const GARBAGE = "▓▒░#@%&?!/<>0123456789ABCDEF";
export type TakeoverView = { heading: string; lines: string[]; bar: number | null; inverted: boolean; cursor: boolean };

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

export function takeoverView(screen: TerminalScreen, time: number): TakeoverView {
  const elapsed = Math.max(time - screen.at, 0);
  // Bursts of 0.15-1.2 s (pauses only a moment), found by walking along from the start
  const kindOf = (n: number) => (n === 0 ? "log" : pick(["log", "log", "log", "hex", "hex", "bar", "bar", "garbage", "pause"], n * 13));
  let burst = 0;
  let start = 0;
  for (;;) {
    const h = hashed(burst * 7 + 1);
    const length = kindOf(burst) === "pause" ? 0.15 + h * 0.25 : 0.15 + h * h * 1.05;
    if (elapsed < start + length) break;
    start += length;
    burst += 1;
  }
  const t = elapsed - start;
  const tick = Math.floor(elapsed * 20); // twenty changes a second
  const kind = kindOf(burst);
  const heading = corrupt(pick(TAKEOVER_HEADINGS, burst * 3), kind === "garbage" ? 0.6 : 0.12, tick);
  // Now and then a whole burst comes up inverted
  const inverted = burst > 1 && kind !== "pause" && hashed(burst * 17) < 0.08;
  switch (kind) {
    case "hex": {
      const address = Math.floor(hashed(burst) * 0xfff0) + tick * 8;
      const lines = [0, 1, 2].map((r) => {
        const at = (address + r * 8) & 0xffff;
        return `${at.toString(16).toUpperCase().padStart(4, "0")}  ${[0, 1, 2, 3, 4, 5].map((b) => hex(at * 8 + b)).join(" ")}`;
      });
      return { heading, lines, bar: null, inverted, cursor: false };
    }
    case "bar": {
      // Races toward a random target, then jitters there
      const target = 0.3 + hashed(burst * 5) * 0.7;
      const fill = Math.max(0, Math.min(Math.min(t * 3, target) + (hashed(tick) - 0.5) * 0.08, 1));
      return { heading, lines: [corrupt(pick(TAKEOVER_LOG, burst * 11), 0.08, tick), `${Math.round(fill * 100)}%`], bar: fill, inverted, cursor: false };
    }
    case "garbage":
      return { heading, lines: [0, 1, 2].map((r) => garbage(22, tick * 3 + r)), bar: null, inverted, cursor: false };
    case "pause":
      return { heading: "", lines: [], bar: null, inverted: false, cursor: Math.floor(time * 2.5) % 2 === 0 };
    default: {
      // Log lines scrolling up, a new one every eighth of a second, the newest still typing
      const step = Math.floor(t * 8);
      const lines = [2, 1, 0].map((back) => {
        const n = burst * 97 + step - back;
        const line = `> ${pick(TAKEOVER_LOG, n)}`;
        return back === 0 ? line.slice(0, Math.ceil((t * 8 - step) * line.length * 2)) : corrupt(line, 0.05, n + tick);
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
