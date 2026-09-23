import type { FeedMessage, MatchStore } from "../matchStore";

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 15000;

export function monsterBashSocketUrl() {
  const base = import.meta.env.VITE_BASE_URL || window.location.origin;
  const url = new URL("monster-bash/ws", base.endsWith("/") ? base : `${base}/`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

// Connects a store to the live Monster Bash server, reconnecting with backoff.
// Every (re)connect starts with a fresh snapshot from the server, so a dropped
// connection just picks the bout back up. Returns a disconnect function.
export function connectSocketFeed(store: MatchStore, url = monsterBashSocketUrl()) {
  let socket: WebSocket | null = null;
  let retryMs = MIN_RETRY_MS;
  let retryTimer: number | undefined;
  let closed = false;

  const connect = () => {
    socket = new WebSocket(url);
    socket.onopen = () => {
      retryMs = MIN_RETRY_MS;
      store.setConnection("live");
    };
    socket.onmessage = (event) => {
      try {
        store.receive(JSON.parse(event.data) as FeedMessage);
      } catch (error) {
        console.error("Bad Monster Bash message", error);
      }
    };
    socket.onclose = () => {
      if (closed) return;
      store.setConnection("reconnecting");
      retryTimer = window.setTimeout(connect, retryMs);
      retryMs = Math.min(MAX_RETRY_MS, retryMs * 2);
    };
  };

  // Browsers throttle background tabs; reconnect straight away on return
  // instead of waiting out a long backoff.
  const onVisible = () => {
    if (document.visibilityState !== "visible" || socket?.readyState !== WebSocket.CLOSED) return;
    window.clearTimeout(retryTimer);
    retryMs = MIN_RETRY_MS;
    connect();
  };

  store.setConnection("connecting");
  connect();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    closed = true;
    window.clearTimeout(retryTimer);
    document.removeEventListener("visibilitychange", onVisible);
    socket?.close();
  };
}
