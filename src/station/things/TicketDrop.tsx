import { useEffect, useRef, useState } from "react";
import TicketIcon from "../../components/TicketIcon";
import { TICKETS_EVENT } from "../../pages/Arcade/games";
import { useSummary } from "../data.ts";
import { pixel } from "../style/theme.ts";

// Tickets coming in (a stub picked up off the floor, a run paid out at the arcade, the
// dispenser, a code): a little counter drops down from the top left corner, counts up from
// what you had to what you have, hangs a moment, and goes back up.
//
// Whoever pays says so with a "wayside:tickets" or the arcade's tickets event. If the event
// says how many (detail: { tickets, balance }), the count starts at once; if not, it waits
// for your ticket count to be read again and counts up to that.

type Win = { tickets?: number; balance?: number | null };

const COUNT_MS = 700;
const HANG_MS = 1500;
const GIVE_UP_MS = 3000; // (nothing came of it: back up)

export default function TicketDrop() {
  const { data: summary } = useSummary();
  const balance = summary?.coinBalance ?? null;
  const known = useRef<number | null>(balance);
  // Down or not; what it counts from, and to (null: not known yet); what it reads now
  const [down, setDown] = useState(false);
  const [run, setRun] = useState<{ from: number; to: number | null; id: number } | null>(null);
  const [reading, setReading] = useState(0);
  const readingNow = useRef(0);
  readingNow.current = reading;

  useEffect(() => {
    const onTickets = (event: Event) => {
      const win = ((event as CustomEvent<Win | undefined>).detail ?? {}) as Win;
      // (from what it's showing, if it's already down; else from what you had)
      let from = down ? readingNow.current : known.current ?? 0;
      const to = typeof win.balance === "number" ? win.balance : win.tickets ? from + win.tickets : null;
      // (nothing to count to, and no count of yours read yet to show: nothing to say)
      if (to === null && known.current === null && !down) return;
      if (to !== null && to <= from) from = Math.max(0, to - (win.tickets || 1));
      setReading(from);
      setRun({ from, to, id: Date.now() });
      setDown(true);
    };
    window.addEventListener("wayside:tickets", onTickets);
    window.addEventListener(TICKETS_EVENT, onTickets);
    return () => {
      window.removeEventListener("wayside:tickets", onTickets);
      window.removeEventListener(TICKETS_EVENT, onTickets);
    };
  }, [down]);

  // Your count, read again: what a win that didn't say how many counts up to
  useEffect(() => {
    known.current = balance;
    if (balance === null) return;
    setRun((current) => (current && current.to === null && balance > current.from ? { ...current, to: balance } : current));
  }, [balance]);

  // Count up, hang, and go back up
  useEffect(() => {
    if (!run) return;
    if (run.to === null) {
      const giveUp = window.setTimeout(() => setDown(false), GIVE_UP_MS);
      return () => window.clearTimeout(giveUp);
    }
    const { from, to } = run;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now() + 350; // (once it's dropped)
    let frame = 0;
    const tick = () => {
      const k = reduced ? 1 : Math.min(1, Math.max(0, (performance.now() - started) / COUNT_MS));
      setReading(Math.round(from + (to - from) * k));
      if (k < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    const up = window.setTimeout(() => setDown(false), 350 + COUNT_MS + HANG_MS);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(up);
    };
  }, [run]);

  return (
    <div
      className="pointer-events-none fixed left-3 top-0 z-[70] transition-transform duration-300 ease-out md:left-5"
      style={{ transform: down ? "translateY(0)" : "translateY(-120%)" }}
      aria-live="polite"
      aria-hidden={!down}
    >
      {/* (hung from the top edge by two short chains) */}
      <div className="flex justify-between px-4" aria-hidden>
        <span className="h-3 w-0.5 bg-[#f2c35b]/70" />
        <span className="h-3 w-0.5 bg-[#f2c35b]/70" />
      </div>
      <div
        className="flex items-center gap-2 rounded-[3px] border-2 border-[#f2c35b] bg-[#0d131b] px-3 py-1.5 text-xl text-[#ffd27a] shadow-[0_4px_0_rgba(0,0,0,0.5)]"
        style={{ ...pixel, marginTop: 0, paddingTop: "max(0.375rem, env(safe-area-inset-top))" }}
      >
        <TicketIcon className="h-4 w-6" perforation="#0d131b" />
        <span aria-label={`${reading.toLocaleString()} tickets`}>{reading.toLocaleString()}</span>
      </div>
    </div>
  );
}
