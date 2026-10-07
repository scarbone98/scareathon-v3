// The capsule machine beside the arcade: a turn of the crank costs tickets and drops a
// capsule with a hat or something to hold in it, out of the item shop. Mostly common ones.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import TicketIcon from "../../components/TicketIcon";
import { fetchWithAuth } from "../../fetchWithAuth";
import { CAPSULE_TURN_MS, capsuleSignal } from "../capsuleSignal.ts";
import { useSummary } from "../data.ts";
import type { GoTo } from "../stops.ts";
import { plateButton, serif, stubButton } from "../style/theme.ts";
import { Problem } from "../style/ui.tsx";
import "./capsule.css";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
type Machine = { price: number; odds: Record<Rarity, number>; stock: Record<Rarity, number> };
type Won = { item: { id: number; name: string; icon: string; rarity: Rarity; category: string }; itemInstanceId: number; coinBalance: number };
// idle: nothing out. turning: the crank's going. dropped: a capsule, still shut. open: what was in it.
type Phase = "idle" | "turning" | "dropped" | "open";

const RARITIES: { id: Rarity; label: string; colour: string }[] = [
  { id: "common", label: "Common", colour: "#cfc7da" },
  { id: "uncommon", label: "Uncommon", colour: "#7ddc8a" },
  { id: "rare", label: "Rare", colour: "#6ab4ff" },
  { id: "epic", label: "Epic", colour: "#c58bff" },
  { id: "legendary", label: "Legendary", colour: "#ffc24a" },
];
const OPENS_AFTER_MS = 900;

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
  const [phase, setPhase] = useState<Phase>("idle");
  const [won, setWon] = useState<Won | null>(null);

  const pull = useMutation({
    mutationFn: async () => {
      // The crank turns while the server picks; the capsule never beats the crank out
      capsuleSignal.turnedAt = performance.now();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const [result] = await Promise.all([fetchWithAuth("/capsule/pull", { method: "POST" }).then(readData<Won>), wait(reduced ? 0 : CAPSULE_TURN_MS)]);
      return result;
    },
    onMutate: () => {
      setWon(null);
      setPhase("turning");
    },
    onSuccess: (result) => {
      setWon(result);
      setPhase("dropped");
      void queryClient.invalidateQueries({ queryKey: ["home-v2", "summary"] });
      void queryClient.invalidateQueries({ queryKey: ["user", "wallet"] });
      void queryClient.invalidateQueries({ queryKey: ["marketplace", "shop"] });
      void queryClient.invalidateQueries({ queryKey: ["avatar"] });
    },
    onError: () => setPhase("idle"),
  });

  // A dropped capsule pops open by itself after a beat (or at a tap)
  useEffect(() => {
    if (phase !== "dropped") return;
    const open = window.setTimeout(() => setPhase("open"), OPENS_AFTER_MS);
    return () => window.clearTimeout(open);
  }, [phase]);

  const price = machine.data?.price;
  const balance = summary?.coinBalance;
  const short = price != null && balance != null && balance < price;
  const rarity = won?.item.rarity ?? "common";
  const lid = RARITIES.find((entry) => entry.id === rarity)?.colour ?? RARITIES[0].colour;
  const busy = phase === "turning" || phase === "dropped";

  return (
    <div className={`capsule capsule-rarity-${rarity} is-${phase} flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">Capsule machine</p>
          <h3 className="mt-1 text-xl text-[#f2ead2]" style={serif}>
            A hat or a thing to hold, in every capsule
          </h3>
        </div>
        {signedIn && (
          <p className="flex shrink-0 items-center gap-1.5 text-sm text-amber-300">
            {balance != null ? <span aria-label={`${balance.toLocaleString()} tickets`}>{balance.toLocaleString()}</span> : "…"}
            <TicketIcon className="h-4 w-6" perforation="#0d131b" />
          </p>
        )}
      </div>

      <button
        type="button"
        className="capsule-stage"
        onClick={() => phase === "dropped" && setPhase("open")}
        disabled={phase !== "dropped"}
        aria-label={phase === "dropped" ? "Open the capsule" : undefined}
      >
        {phase === "open" && won && <span className="capsule-rays" aria-hidden />}
        <Ball colour={phase === "idle" || phase === "turning" ? "#8a2f2a" : lid} />
        {phase === "open" && won && <img className="capsule-item" src={won.item.icon} alt="" draggable={false} />}
      </button>

      <div className="min-h-[4.5rem] text-center" aria-live="polite">
        {phase === "open" && won ? (
          <div className="capsule-words flex flex-col items-center gap-1">
            <span className="capsule-chip">{rarity}</span>
            <span className="text-lg text-[#faf5ed]" style={serif}>
              {won.item.name}
            </span>
            <span className="text-xs text-[#9fdcb2]">It's in your locker.</span>
          </div>
        ) : (
          <p className="pt-3 text-sm text-stone-400" style={serif}>
            {phase === "turning" ? "Clunk. Clunk. Clunk…" : phase === "dropped" ? "Here it comes." : "Turn the crank and see what drops."}
          </p>
        )}
      </div>

      {pull.error && <Problem message={pull.error.message} />}

      {signedIn ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button type="button" className={stubButton} disabled={busy || short || price == null} onClick={() => pull.mutate()}>
            {phase === "open" ? "Turn it again" : "Turn the crank"}
            {price != null && (
              <span className="flex items-center gap-1">
                {price}
                <TicketIcon className="h-4 w-6" perforation="#efe3c8" />
              </span>
            )}
          </button>
          {phase === "open" && (
            <button type="button" className={plateButton} onClick={() => goTo("lockers", "wardrobe")}>
              Go and put it on
            </button>
          )}
        </div>
      ) : (
        <div className="text-center">
          <p className="text-sm text-stone-300" style={serif}>
            The machine takes passengers' tickets.
          </p>
          <button type="button" onClick={() => goTo("tickets")} className={`${stubButton} mt-2`}>
            Sign in at the counter
          </button>
        </div>
      )}
      {signedIn && short && phase !== "open" && <p className="text-center text-xs text-stone-400">Not enough tickets. The arcade pays out.</p>}

      {machine.data && (
        <div className="mt-1 border-t border-[#f2ead2]/15 pt-3">
          <p className="text-[11px] uppercase tracking-[0.3em] text-[#f2ead2]/55">What's inside</p>
          <ul className="mt-2 grid grid-cols-1 gap-x-10 gap-y-1 text-sm text-stone-300 sm:grid-cols-2">
            {RARITIES.filter((entry) => machine.data.stock[entry.id] > 0).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: entry.colour }} />
                  {entry.label}
                  <span className="text-stone-500">({machine.data.stock[entry.id]})</span>
                </span>
                <span className="tabular-nums text-[#f2ead2]">{machine.data.odds[entry.id]}%</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">You can get one you already have. Everything in it is in the item shop too.</p>
        </div>
      )}
      {machine.error && <Problem message="The machine's glass is fogged up. Try again in a moment." />}
    </div>
  );
}
