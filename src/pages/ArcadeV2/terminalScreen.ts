import type { MachineData } from "../Arcade/games.tsx";

// What the slot's little green-screen terminal shows. The info card is the same
// terminal seen up close, so both draw from this: the same screen, typed out at
// the same speed from the same moment.
export type TerminalScreen = { at: number } & (
  | { kind: "game"; game: MachineData } // the picked (or plugged-in) game
  | { kind: "message"; lines: string[] } // e.g. "> EJECT"; the first line is the heading
  | { kind: "loading"; title: string } // a cartridge on its way into the slot
  | { kind: "reboot"; seconds: number } // tapped till it crashed: a fault, then a reboot
);

// How the terminal is set up, apart from what it's showing
export type TerminalOptions = {
  details: boolean; // the ? key: a game's release, players and genre instead of its pitch
  phone: boolean; // the site menu key sits in the corner, and there's no keyboard hint
};

export const TERMINAL_CPS = 60; // characters typed a second
export const PLAY_HINT = "CLICK TWICE TO PLAY · ← → ENTER";
export const LOADING_BLOCKS = 14;
const LOADING_BLOCKS_PER_SECOND = 6;
const REBOOT_CRASH = 1.4; // seconds of fault report before the reboot starts
const REBOOT_CHECKS = ["MEM CHECK... OK", "TAPE DRIVE.. OK", "SCANNER..... OK"];

export const nowSeconds = () => performance.now() / 1000;

export const gameTitle = (game: MachineData) => game.name.replace(/[‘’]/g, "'").toUpperCase();

export function gameLines(game: MachineData, details: boolean) {
  return details
    ? [
        `RELEASED ${game.cartridge.about.released}`,
        `PLAYERS  ${game.cartridge.about.players.toUpperCase()}`,
        `GENRE    ${game.cartridge.about.genre.toUpperCase()}`,
      ]
    : [`> ${game.cartridge.tagline}`];
}

// The heading and lines that type out, in order
export function typedParts(screen: TerminalScreen, details: boolean): string[] {
  if (screen.kind === "game") return [gameTitle(screen.game), ...gameLines(screen.game, details)];
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

// Whether the screen has stopped changing (so there's nothing more to redraw)
export function settled(screen: TerminalScreen, details: boolean, time: number) {
  if (screen.kind === "reboot") return false;
  if (screen.kind === "loading") return loadingView(screen, time).blocks >= LOADING_BLOCKS;
  return typeOut(typedParts(screen, details), screen, time).done;
}
