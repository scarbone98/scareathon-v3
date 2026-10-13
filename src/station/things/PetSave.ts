import { useEffect, useMemo, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import { fetchWithAuth } from "../../fetchWithAuth";

// A creature's save belongs to its keeper's account, not to a browser (server/routes/petSave.js).
// When its game starts it asks whose room it is (PetFrame: <PREFIX>_HELLO) and is told, with
// the save the account holds; after that it hands over every save it writes, and they're sent
// up: at once if it's been a while, otherwise the latest when the while is up, and whatever is
// waiting when the page is put away. A game that couldn't be told whose it is plays on the
// browser's own save and sends nothing, so a room that couldn't be fetched is never written
// over with an empty one.

const EVERY = 20_000;

export function usePetSave(session: Session | null | undefined, game: string) {
  const now = useRef(session);
  now.current = session;
  // (whose room the game was told it is: nobody else's saves go up)
  const told = useRef("");
  const waiting = useRef<Record<string, unknown> | null>(null);
  const sentAt = useRef(0);
  const timer = useRef<number>();

  const save = useMemo(() => {
    const send = (leaving = false) => {
      window.clearTimeout(timer.current);
      timer.current = undefined;
      const save = waiting.current;
      if (!save || !told.current || now.current?.user.id !== told.current) return;
      waiting.current = null;
      sentAt.current = Date.now();
      fetchWithAuth(`/pet-save/${game}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ save }), keepalive: leaving }).catch(() => {
        // (not sent: the next one will be, and the game has it meanwhile)
      });
    };
    return {
      send,
      account: async () => {
        // (the session may still be being read when the game asks)
        for (let i = 0; now.current === undefined && i < 40; i += 1) await new Promise((done) => window.setTimeout(done, 200));
        const who = now.current?.user.id;
        if (!who) return { who: "", save: null };
        const response = await fetchWithAuth(`/pet-save/${game}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { data?: { save?: unknown } };
        told.current = who;
        return { who, save: body.data?.save ?? null };
      },
      keep: (save: Record<string, unknown>) => {
        waiting.current = save;
        const wait = sentAt.current + EVERY - Date.now();
        if (wait <= 0) send();
        else if (timer.current === undefined) timer.current = window.setTimeout(send, wait);
      },
    };
  }, [game]);

  useEffect(() => {
    const leave = () => {
      if (document.visibilityState === "hidden") save.send(true);
    };
    const gone = () => save.send(true);
    document.addEventListener("visibilitychange", leave);
    window.addEventListener("pagehide", gone);
    return () => {
      document.removeEventListener("visibilitychange", leave);
      window.removeEventListener("pagehide", gone);
      save.send();
    };
  }, [save]);

  return save;
}
