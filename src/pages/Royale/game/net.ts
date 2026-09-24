// The Crypt Clash socket: one connection per friend match, reconnecting with
// backoff and rejoining its room with the token the server handed out.
import type { MatchResult, MatchState, Play, Team } from "../../../../server/shared/royale/index.js";

export type ServerMessage =
  | { type: "room"; code: string; team: Team; token: string; status: string; names: string[] }
  | { type: "room-info"; code: string; status: "waiting" | "full" | "missing"; host?: string }
  | { type: "start"; code: string; team: Team; seed: string; decks: [string[], string[]]; names: [string, string]; startsInMs: number }
  | { type: "tick"; n: number; plays: Play[]; hash?: number }
  | { type: "sync"; state: MatchState }
  | { type: "end"; result: MatchResult }
  | { type: "rematch"; ready: [boolean, boolean] }
  | { type: "presence"; connected: [boolean, boolean] }
  | { type: "left"; team: Team }
  | { type: "error"; code: string; message: string }
  | { type: "pong"; t: number };

export type SocketStatus = "connecting" | "open" | "reconnecting";

const SESSION_KEY = "crypt-clash-session";
const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;

export interface Session {
  code: string;
  token: string;
}

export function savedSession(): Session | null {
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

export function clashSocketUrl() {
  const base = import.meta.env.VITE_BASE_URL || window.location.origin;
  const url = new URL("crypt-clash/ws", base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class ClashSocket {
  private socket: WebSocket | null = null;
  private retryMs = MIN_RETRY_MS;
  private retryTimer: number | undefined;
  private closed = false;
  private outbox: string[] = [];
  session: Session | null;

  constructor(
    private onMessage: (message: ServerMessage) => void,
    private onStatus: (status: SocketStatus) => void,
    resume: Session | null = null,
    private url = clashSocketUrl(),
  ) {
    this.session = resume;
    this.onStatus("connecting");
    this.connect();
    document.addEventListener("visibilitychange", this.onVisible);
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
    };
    socket.onmessage = (event) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(event.data) as ServerMessage;
      } catch {
        return;
      }
      if (message.type === "room") {
        this.session = { code: message.code, token: message.token };
        saveSession(this.session);
      }
      if (message.type === "error" && message.code === "missing" && this.session) {
        this.session = null;
        saveSession(null);
      }
      this.onMessage(message);
    };
    socket.onclose = () => {
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

  // Plays are dropped while disconnected (they'd be stale); anything else is
  // queued until the socket opens.
  send(message: { type: string; [key: string]: unknown }) {
    const data = JSON.stringify(message);
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(data);
    else if (message.type !== "play") this.outbox.push(data);
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
    document.removeEventListener("visibilitychange", this.onVisible);
    const socket = this.socket;
    // Let a queued 'leave' flush before closing.
    if (socket?.readyState === WebSocket.OPEN) window.setTimeout(() => socket.close(), 50);
    else socket?.close();
  }
}
