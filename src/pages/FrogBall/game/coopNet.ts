// The Frog Ball co-op socket: one connection per player, reconnecting with
// backoff and rejoining its room with the token the server handed out. It
// also keeps an estimate of the server's clock, which both players' stage
// clocks count from.

export type Seat = 0 | 1;
export type Vec3 = [number, number, number];

export type ServerMessage =
  | { type: "room"; code: string; seat: Seat; token: string; status: "waiting" | "lobby" | "playing"; names: string[]; connected: boolean[] }
  | { type: "room-info"; code: string; status: "waiting" | "full" | "missing"; host?: string }
  | { type: "start"; stage: number; attempt: number; at: number; lives: number; score: number; names: string[] }
  | { type: "peer"; seat: Seat; a: number; t: number; p: Vec3; v: Vec3; k?: [number, number]; s: string }
  | { type: "fly"; id: number; seat: Seat }
  | { type: "goal"; seat: Seat }
  | { type: "outcome"; attempt: number; kind: "clear" | "fall" | "time"; seat?: Seat; lives: number; score: number; info?: { timeBonus: number; flyBonus: number; fast: boolean; total: number } }
  | { type: "over"; cleared: boolean; reason: "cleared" | "lives" | "disconnected"; score: number; stage: number }
  | { type: "presence"; connected: boolean[] }
  | { type: "left"; seat: Seat }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; t: number; now: number };

export type SocketStatus = "connecting" | "open" | "reconnecting";

const SESSION_KEY = "frog-ball-coop";
const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;
const PING_MS = 2000;
const CLOCK_SAMPLES = 8;

interface Session {
  code: string;
  token: string;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Private mode: a refresh just won't rejoin.
  }
}

export function coopSocketUrl() {
  const base = import.meta.env.VITE_BASE_URL || window.location.origin;
  const url = new URL("frog-ball/ws", base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// A link to open straight into someone's room.
export const roomLink = (code: string) => `${window.location.origin}/frog-ball?room=${code}`;

export class CoopSocket {
  private socket: WebSocket | null = null;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private closed = false;
  private outbox: string[] = [];
  // Clock samples from pings: [round trip, server minus local].
  private samples: [number, number][] = [];
  private offset = 0;
  rtt = 0;
  session: Session | null;

  constructor(
    private onMessage: (message: ServerMessage) => void,
    private onStatus: (status: SocketStatus) => void,
    resume = false,
    private url = coopSocketUrl(),
  ) {
    this.session = resume ? loadSession() : null;
    this.onStatus("connecting");
    this.connect();
    document.addEventListener("visibilitychange", this.onVisible);
  }

  static hasSession() {
    return !!loadSession();
  }

  // The server's clock, in ms.
  serverNow() {
    return Date.now() + this.offset;
  }

  private connect = () => {
    const socket = new WebSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.retryMs = MIN_RETRY_MS;
      this.onStatus("open");
      if (this.session) socket.send(JSON.stringify({ type: "rejoin", ...this.session }));
      for (const data of this.outbox) socket.send(data);
      this.outbox = [];
      this.ping();
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(this.ping, PING_MS);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === "pong") {
        this.clockSample(message);
        return;
      }
      if (message.type === "room") {
        this.session = { code: message.code, token: message.token };
        saveSession(this.session);
      }
      if ((message.type === "error" && message.code === "missing") || message.type === "left") {
        this.session = null;
        saveSession(null);
      }
      this.onMessage(message);
    };
    socket.onclose = () => {
      window.clearInterval(this.pingTimer);
      if (this.closed || this.socket !== socket) return;
      this.onStatus("reconnecting");
      this.retryTimer = window.setTimeout(this.connect, this.retryMs);
      this.retryMs = Math.min(MAX_RETRY_MS, this.retryMs * 2);
    };
  };

  private ping = () => {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: "ping", t: Date.now() }));
  };

  // The fastest recent round trips give the truest clock offset.
  private clockSample(m: { t: number; now: number }) {
    const back = Date.now();
    const rtt = back - m.t;
    this.samples.push([rtt, m.now + rtt / 2 - back]);
    if (this.samples.length > CLOCK_SAMPLES) this.samples.shift();
    const best = [...this.samples].sort((a, b) => a[0] - b[0])[0];
    this.offset = best[1];
    this.rtt = Math.round(this.samples.reduce((s, x) => s + x[0], 0) / this.samples.length);
  }

  // Browsers throttle background tabs; reconnect at once when the tab returns.
  private onVisible = () => {
    if (document.visibilityState !== "visible" || this.socket?.readyState !== WebSocket.CLOSED || this.closed) return;
    window.clearTimeout(this.retryTimer);
    this.retryMs = MIN_RETRY_MS;
    this.connect();
  };

  // Ball updates are dropped while disconnected (they'd be stale); anything
  // else is queued until the socket opens.
  send(message: { type: string; [key: string]: unknown }) {
    const data = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
    else if (message.type !== "state") this.outbox.push(data);
  }

  // Leaves for good: tells the room, forgets the session.
  leave() {
    this.send({ type: "leave" });
    this.session = null;
    saveSession(null);
    this.close();
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    document.removeEventListener("visibilitychange", this.onVisible);
    const socket = this.socket;
    // Let a queued 'leave' flush before closing.
    if (socket?.readyState === WebSocket.OPEN) window.setTimeout(() => socket.close(), 50);
    else socket?.close();
  }
}
