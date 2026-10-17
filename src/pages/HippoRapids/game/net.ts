// The Hippo Rapids socket: one connection per player, reconnecting with backoff and
// rejoining its room with the token the server handed out.
import type { Level, Snapshot } from "../../../../server/shared/hippoRapids/index.js";

export type RoomStatus = "lobby" | "playing" | "done";

export type ServerMessage =
  | { type: "room"; code: string; seat: number; token: string; status: RoomStatus; seats: number; level: string; def: Level | null; host: number; names: (string | null)[]; connected: boolean[] }
  | { type: "room-info"; code: string; status: "open" | "full" | "missing"; seats?: number; free?: number; host?: string }
  | { type: "start" }
  | ({ type: "snap" } & Snapshot)
  | { type: "presence"; connected: boolean[] }
  | { type: "left"; seat: number; name: string; reason: "left" | "dropped" }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; t: number };

export type SocketStatus = "connecting" | "open" | "reconnecting";

const SESSION_KEY = "hippo-rapids-room";
const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;
const PING_MS = 15000;

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

export function socketUrl() {
  const base = import.meta.env.VITE_BASE_URL || window.location.origin;
  const url = new URL("hippo-rapids/ws", base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// A link that opens straight into someone's room.
export const roomLink = (code: string) => `${window.location.origin}/hippo-rapids?room=${code}`;

export class RoomSocket {
  private socket: WebSocket | null = null;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: number | undefined;
  private pingTimer: number | undefined;
  private closed = false;
  private outbox: string[] = [];
  session: Session | null;

  constructor(
    private onMessage: (message: ServerMessage) => void,
    private onStatus: (status: SocketStatus) => void,
    resume = false,
    private url = socketUrl(),
  ) {
    this.session = resume ? loadSession() : null;
    this.onStatus("connecting");
    this.connect();
    document.addEventListener("visibilitychange", this.onVisible);
  }

  // The room this tab was last in, if any (tabs don't share it).
  static savedRoom() {
    return loadSession()?.code ?? null;
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
      window.clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ type: "ping", t: Date.now() })), PING_MS);
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === "pong") return;
      if (message.type === "room") {
        this.session = { code: message.code, token: message.token };
        saveSession(this.session);
      }
      if (message.type === "error" && message.code === "missing") {
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

  // Browsers throttle background tabs; reconnect at once when the tab returns.
  private onVisible = () => {
    if (document.visibilityState !== "visible" || this.socket?.readyState !== WebSocket.CLOSED || this.closed) return;
    window.clearTimeout(this.retryTimer);
    this.retryMs = MIN_RETRY_MS;
    this.connect();
  };

  // Inputs are dropped while disconnected (they'd be stale); anything else waits for the socket.
  send(message: { type: string; [key: string]: unknown }) {
    const data = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
    else if (message.type !== "in") this.outbox.push(data);
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
