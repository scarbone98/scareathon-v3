// The capsule machine beside the arcade: wind its crank and 75 tickets go in the slot, the
// capsules rattle, and one drops out of the chute with a hat or something to hold in it, out
// of the item shop (mostly common ones). The machine itself does all of that, in the scene;
// this is what's over it: your ticket count going down, a word of what to do, and the
// capsule coming open in your hands.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import TicketIcon from "../../components/TicketIcon";
import { fetchWithAuth } from "../../fetchWithAuth";
import { CAPSULE_MS, capsuleMachine } from "../capsuleSignal.ts";
import { useSummary } from "../data.ts";
import type { GoTo } from "../stops.ts";
import { plate, plateButton, serif, stubButton } from "../style/theme.ts";
import "./capsule.css";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
type Machine = { price: number };
type Won = { item: { id: number; name: string; icon: string; rarity: Rarity; category: string }; itemInstanceId: number; coinBalance: number };

const RARITIES: { id: Rarity; label: string; colour: string }[] = [
  { id: "common", label: "Common", colour: "#cfc7da" },
  { id: "uncommon", label: "Uncommon", colour: "#7ddc8a" },
  { id: "rare", label: "Rare", colour: "#6ab4ff" },
  { id: "epic", label: "Epic", colour: "#c58bff" },
  { id: "legendary", label: "Legendary", colour: "#ffc24a" },
];
// How long the capsule sits shut in your hands before it bursts
const OPENS_AFTER_MS = 650;

async function readData<T>(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { message?: string }).message || "The machine is out of order.");
  return (body as { data: T }).data;
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

// A capsule: its lid in the colour of what's inside, so a gold one is worth a gasp
function Ball({ colour }: { colour: string }) {
  return (
    <svg viewBox="0 0 84 84" className="capsule-ball" aria-hidden>
      <g className="capsule-half capsule-bottom">
        <path d="M4 42a38 38 0 0 0 76 0z" fill="#efe6cf" />
        <path d="M4 42a38 38 0 0 0 76 0z" fill="none" stroke="#1d2a3a" strokeWidth="3" />
      </g>
      <g className="capsule-half capsule-top">
        <path d="M4 42a38 38 0 0 1 76 0z" fill={colour} />
        <path d="M16 30a26 26 0 0 1 22-18" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="5" strokeLinecap="round" />
        <path d="M4 42a38 38 0 0 1 76 0z" fill="none" stroke="#1d2a3a" strokeWidth="3" />
      </g>
    </svg>
  );
}

export default function Capsule({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const queryClient = useQueryClient();
  const { data: summary } = useSummary();
  const machine = useQuery<Machine>({
    queryKey: ["capsule", "machine"],
    queryFn: () => fetchWithAuth("/capsule/machine").then(readData<Machine>),
    staleTime: 1000 * 60 * 5,
  });
  const balance = summary?.coinBalance ?? null;
  const price = machine.data?.price ?? null;
  // What the counter reads: your tickets, or mid-turn the count on its way down
  const [reading, setReading] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [won, setWon] = useState<Won | null>(null);
  const [open, setOpen] = useState(false);
  // (the latest of everything, for the crank, which is wound from the scene)
  const now = useRef({ signedIn, balance, price, busy });
  now.current = { signedIn, balance, price, busy };
  const here = useRef(true);

  const cranked = useCallback(async () => {
    const { signedIn: passenger, balance: tickets, price: cost, busy: turning } = now.current;
    if (turning || capsuleMachine.phase !== "idle") return;
    if (!passenger) return setNote("The machine takes passengers' tickets. Sign in at the counter.");
    if (cost === null || tickets === null) return setNote("The machine's warming up. Try again in a moment.");
    if (tickets < cost) return setNote(`A turn is ${cost} tickets. You have ${tickets.toLocaleString()}. The arcade pays out.`);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pace = reduced ? 0 : 1;
    setBusy(true);
    setNote(null);
    setWon(null);
    setOpen(false);
    // The tickets go in: the count runs down by the price as they do
    capsuleMachine.set("paying");
    const pull = fetchWithAuth("/capsule/pull", { method: "POST" }).then(readData<Won>);
    pull.catch(() => undefined);
    const began = performance.now();
    await new Promise<void>((resolve) => {
      const step = () => {
        const u = pace ? Math.min(1, (performance.now() - began) / CAPSULE_MS.pay) : 1;
        if (here.current) setReading(Math.round(tickets - cost * u));
        if (u < 1 && here.current) requestAnimationFrame(step);
        else resolve();
      };
      step();
    });
    // It shakes for as long as the server takes to say what's in the capsule
    capsuleMachine.set("shaking");
    const [result] = await Promise.allSettled([pull, wait(CAPSULE_MS.shake * pace)]);
    if (!here.current) return;
    if (result.status === "rejected") {
      capsuleMachine.set("idle");
      setReading(null);
      setBusy(false);
      setNote(result.reason instanceof Error ? result.reason.message : "The machine jammed. Your tickets are safe; try again.");
      void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
      return;
    }
    const prize = result.value;
    capsuleMachine.set("beat");
    await wait(CAPSULE_MS.beat * pace);
    capsuleMachine.set("out", RARITIES.find((entry) => entry.id === prize.item.rarity)?.colour);
    await wait(CAPSULE_MS.out * pace);
    if (!here.current) return;
    capsuleMachine.set("revealed");
    setReading(prize.coinBalance);
    setWon(prize);
    void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
    void queryClient.invalidateQueries({ queryKey: ["user", "wallet"] });
    void queryClient.invalidateQueries({ queryKey: ["marketplace", "shop"] });
    void queryClient.invalidateQueries({ queryKey: ["avatar"] });
  }, [queryClient]);

  // The crank is the scene's: it calls here when it's been wound right round
  useEffect(() => {
    here.current = true;
    capsuleMachine.onCranked = () => void cranked();
    return () => {
      here.current = false;
      capsuleMachine.onCranked = null;
      capsuleMachine.set("idle");
    };
  }, [cranked]);

  // (a word about signing in, say, is stale once you have)
  useEffect(() => setNote(null), [signedIn]);

  // The capsule in your hands pops open after a beat
  useEffect(() => {
    if (!won) return;
    const burst = window.setTimeout(() => setOpen(true), OPENS_AFTER_MS);
    return () => window.clearTimeout(burst);
  }, [won]);

  const putAway = () => {
    setWon(null);
    setOpen(false);
    setBusy(false);
    setReading(null);
    capsuleMachine.set("idle");
  };

  const shown = reading ?? balance;
  const rarity = won?.item.rarity ?? "common";
  const lid = RARITIES.find((entry) => entry.id === rarity)?.colour ?? RARITIES[0].colour;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-end justify-between p-3 pb-16 text-[#f2ead2] md:p-5 md:pb-6">
      {/* Your tickets, top middle: they go down as the machine takes them */}
      <div className={`${plate} flex items-center gap-3 px-3 py-1.5 text-[15px]`}>
        {signedIn && (
          <span className="flex items-center gap-1.5 text-amber-300" aria-live="off">
            <span className="tabular-nums" aria-label={shown !== null ? `${shown.toLocaleString()} tickets` : undefined}>
              {shown !== null ? shown.toLocaleString() : "…"}
            </span>
            <TicketIcon className="h-4 w-6" perforation="#1d2a3a" />
          </span>
        )}
        {price !== null && (
          <span className="flex items-center gap-1.5 text-[#f2ead2]/80">
            {signedIn && <span className="text-[#f2ead2]/85">·</span>}
            {price}
            <TicketIcon className="h-4 w-6" perforation="#1d2a3a" />a turn
          </span>
        )}
      </div>

      <div className="flex max-w-md flex-col items-center gap-2 self-center text-center">
        {/* (no hints: the machine's worked as it looks. Only a word when a turn can't be had) */}
        {note && (
          <p className="rounded-[3px] bg-[#0b1017]/85 px-3 py-2 text-sm text-amber-200" role="status" style={serif}>
            {note}
          </p>
        )}
        {!signedIn && (
          <button type="button" onClick={() => goTo("tickets")} className={`${stubButton} pointer-events-auto`}>
            Sign in at the counter
          </button>
        )}
      </div>

      {/* The capsule, come up out of the chute into your hands: it bursts, and there's what was in it */}
      {won && (
        <div className={`capsule capsule-rarity-${rarity} ${open ? "is-open" : "is-shut"} pointer-events-auto absolute inset-0 z-20 flex flex-col items-center justify-center gap-3`} role="dialog" aria-label="Your capsule">
          <button type="button" className="capsule-veil absolute inset-0" onClick={open ? putAway : () => setOpen(true)} aria-label={open ? "Put it away" : "Open the capsule"} />
          <div className="capsule-stage">
            {open && <span className="capsule-rays" aria-hidden />}
            {open && <span className="capsule-flash" aria-hidden />}
            <Ball colour={lid} />
            {open && <img className="capsule-item" src={won.item.icon} alt="" draggable={false} />}
          </div>
          {open && (
            <div className="capsule-words relative flex flex-col items-center gap-1 text-center" aria-live="polite">
              <span className="capsule-chip">{rarity}</span>
              <span className="text-2xl text-[#faf5ed]" style={serif}>
                {won.item.name}
              </span>
              <span className="text-sm text-[#9fdcb2]">It's in your locker.</span>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <button type="button" className={stubButton} onClick={putAway}>
                  Back to the machine
                </button>
                <button type="button" className={plateButton} onClick={() => goTo("lockers", "wardrobe")}>
                  Go and put it on
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
