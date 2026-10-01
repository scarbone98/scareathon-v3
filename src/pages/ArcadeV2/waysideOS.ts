// The WaysideOS cartridge: not a game but a little operating system. Plugged in, the
// cabinet's screen boots it to a code prompt, and codes are typed in on the terminal.
import { canvasFont, TERMINAL_FONT } from "./arcadeFonts.ts";

const INK = "#0b1418";
const AMBER = "#f2b84b";
const PALE = "#e9dcc0";
const DIM = "rgba(233, 220, 192, 0.45)";
export const MAX_CODE = 13;

// What each code does: for now, what the screen says back. Codes are typed in any case
// and without spaces; anything not here is refused.
const CODES: Record<string, string[]> = {
  HELP: ["CODES ARE HIDDEN", "AROUND THE STATION"],
  "0CT0VL": ["SIGNAL FOUND", "IT REMEMBERS YOU"],
};

export function cleanCode(raw: string) {
  return raw.toUpperCase().replace(/\s+/g, "").slice(0, MAX_CODE);
}

// MOTIONCONTROL: shaking the phone rattles the cabinet (off until someone types it; typing
// it again turns it off). Remembered on this device.
const MOTION_KEY = "wayside.motionControl";
let motionControl = (() => {
  try {
    return localStorage.getItem(MOTION_KEY) === "on";
  } catch {
    return false;
  }
})();
export const motionControlOn = () => motionControl;

export type CodeResult = { ok: boolean; lines: string[]; motion?: boolean; remote?: boolean };

export function runCode(raw: string): CodeResult {
  if (cleanCode(raw) === "MOTIONCONTROL") {
    motionControl = !motionControl;
    try {
      localStorage.setItem(MOTION_KEY, motionControl ? "on" : "off");
    } catch {
      // (private windows: it lasts the visit)
    }
    return motionControl
      ? { ok: true, lines: ["MOTION CONTROL ON", "GO ON, GIVE IT A SHAKE"], motion: true }
      : { ok: true, lines: ["MOTION CONTROL OFF", "IT CAN REST NOW"], motion: false };
  }
  const lines = CODES[cleanCode(raw)];
  if (lines) return { ok: true, lines };
  // Anything else might be the rune tablet's code for today: the station checks it
  return cleanCode(raw).length >= 4 ? { ok: false, lines: ["READING THE RUNES..."], remote: true } : { ok: false, lines: ["INVALID CODE"] };
}

// What the station said about a code sent to it (the rune tablet's), for the screen
export async function checkRemoteCode(raw: string, send: (code: string) => Promise<Response>): Promise<CodeResult> {
  try {
    const response = await send(cleanCode(raw));
    if (response.status === 401) return { ok: false, lines: ["SIGN IN TO CLAIM", "AT THE TICKET COUNTER"] };
    if (response.status === 404) return { ok: false, lines: ["INVALID CODE"] };
    const payload = await response.json();
    if (!response.ok) return { ok: false, lines: ["NO SIGNAL", "TRY AGAIN"] };
    if (payload.data?.status === "granted") return { ok: true, lines: ["THE RUNES ACCEPT YOU", `+${payload.data.reward} TICKETS`] };
    return { ok: true, lines: ["ALREADY CLAIMED TODAY", "NEW RUNES AT MIDNIGHT"] };
  } catch {
    return { ok: false, lines: ["NO SIGNAL", "TRY AGAIN"] };
  }
}

export type WaysideState = {
  plugged: boolean; // on the shelf it only shows its boot logo
  entry: string;
  reply: { ok: boolean; lines: string[]; at: number } | null;
  bootAt: number;
};

// Draws a frame; false when nothing's changed since the last one (the caller skips the upload)
export function createWaysideScreen() {
  let last = "";
  const paint = (ctx: CanvasRenderingContext2D, width: number, height: number, time: number, state: WaysideState) => {
    const booting = state.plugged && time - state.bootAt < 1.4;
    const cursorOn = Math.floor(time * 2) % 2 === 0;
    const replyAge = state.reply ? time - state.reply.at : Infinity;
    const key = [state.plugged, state.entry, state.reply?.at, booting ? Math.floor(time * 8) : -1, cursorOn, replyAge < 0.6 ? Math.floor(replyAge * 10) : 0].join("|");
    if (key === last) return false;
    last = key;

    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = "middle";
    ctx.shadowColor = AMBER;

    // The title bar
    ctx.fillStyle = AMBER;
    ctx.fillRect(0, 0, width, 30);
    ctx.fillStyle = INK;
    ctx.font = canvasFont(TERMINAL_FONT, 24);
    ctx.textAlign = "left";
    ctx.fillText("WAYSIDE OS", 12, 16);
    ctx.textAlign = "right";
    ctx.fillText("v1.0", width - 12, 16);

    ctx.textAlign = "center";
    if (!state.plugged) {
      // On the shelf: the logo, a lamp, and an invitation
      ctx.shadowBlur = 12;
      ctx.fillStyle = AMBER;
      ctx.font = canvasFont(TERMINAL_FONT, 56);
      ctx.fillText("WAYSIDE OS", width / 2, height * 0.46);
      ctx.shadowBlur = 0;
      ctx.fillStyle = PALE;
      ctx.font = canvasFont(TERMINAL_FONT, 24);
      if (cursorOn) ctx.fillText("PLUG IN TO BOOT", width / 2, height * 0.72);
    } else if (booting) {
      const t = (time - state.bootAt) / 1.4;
      ctx.fillStyle = PALE;
      ctx.font = canvasFont(TERMINAL_FONT, 26);
      ctx.fillText("BOOTING" + ".".repeat(Math.floor(time * 6) % 4), width / 2, height * 0.45);
      const barW = width * 0.6;
      ctx.strokeStyle = AMBER;
      ctx.lineWidth = 2;
      ctx.strokeRect((width - barW) / 2, height * 0.6, barW, 16);
      ctx.fillStyle = AMBER;
      ctx.fillRect((width - barW) / 2 + 3, height * 0.6 + 3, (barW - 6) * Math.min(t * 1.1, 1), 10);
    } else {
      ctx.fillStyle = PALE;
      ctx.font = canvasFont(TERMINAL_FONT, 26);
      ctx.fillText("ENTER CODE", width / 2, height * 0.3);
      // The entry: a box per character
      const slots = MAX_CODE;
      const gap = 5;
      const slotW = Math.min(30, (width * 0.92 - (slots - 1) * gap) / slots);
      const rowW = slots * slotW + (slots - 1) * gap;
      const x0 = (width - rowW) / 2;
      const y = height * 0.5;
      ctx.font = canvasFont(TERMINAL_FONT, 34);
      for (let i = 0; i < slots; i += 1) {
        const x = x0 + i * (slotW + gap);
        const ch = state.entry[i];
        ctx.fillStyle = i === state.entry.length && cursorOn ? AMBER : DIM;
        ctx.fillRect(x, y + 18, slotW, 3);
        if (ch) {
          ctx.shadowBlur = 8;
          ctx.fillStyle = AMBER;
          ctx.fillText(ch, x + slotW / 2, y);
          ctx.shadowBlur = 0;
        }
      }
      // The answer, flashing in
      if (state.reply && (replyAge > 0.6 || Math.floor(replyAge * 10) % 2 === 0)) {
        ctx.font = canvasFont(TERMINAL_FONT, 26);
        ctx.fillStyle = state.reply.ok ? AMBER : "#e0533b";
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        state.reply.lines.slice(0, 2).forEach((line, i) => ctx.fillText(line, width / 2, height * 0.74 + i * 28));
        ctx.shadowBlur = 0;
      } else if (!state.reply) {
        ctx.fillStyle = DIM;
        ctx.font = canvasFont(TERMINAL_FONT, 20);
        ctx.fillText("TYPE ON THE TERMINAL", width / 2, height * 0.8);
      }
    }
    // Scanlines, like every other screen in the cabinet
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    for (let y = 0; y < height; y += 4) ctx.fillRect(0, y, width, 2);
    return true;
  };
  // Draw the next frame whatever (something else drew over the screen meanwhile)
  paint.invalidate = () => {
    last = "";
  };
  return paint;
}
