import type { FeedMessage, MatchStore } from "../matchStore";

// Connects a store to the in-browser match loop. Returns a disconnect function.
export function connectLocalFeed(store: MatchStore) {
  const worker = new Worker(new URL("./localFight.worker.ts", import.meta.url), {
    type: "module",
  });
  store.setConnection("local");
  worker.onmessage = (event: MessageEvent<FeedMessage>) => store.receive(event.data);
  return () => worker.terminate();
}
