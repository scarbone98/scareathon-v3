// The show's pieces share their hook; hot reload just reloads this file
/* eslint-disable react-refresh/only-export-components */
import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth } from "../../fetchWithAuth";
import type { GoTo } from "../stops.ts";

// The Best Kept Cryptlin show, judged every Friday (server/routes/petShow.js). The cellar's
// game tells the page how well its best cryptlin has been kept (PetFrame: <PREFIX>_KEPT) and
// the page enters it; the notice says when the judging is, who's ahead, and who won last time.
// No scores are shown: a keeper finds out how theirs is doing by looking at it.

type Shown = { petName: string; petKind: string; keeper: string };
type ShowState = {
  week: string;
  judgedAt: string;
  prizes: { place: number; tickets: number }[];
  ahead: (Shown & { yours: boolean })[];
  mine: { petName: string; petKind: string } | null;
  last: { week: string; winners: (Shown & { place: number })[] } | null;
};
export type Kept = { name: string; kind: string; score: number };

const serif = { fontFamily: "'IM Fell English', Georgia, serif" };
const typed = { fontFamily: "'Special Elite', 'Courier New', monospace" };
const PLACES = ["First", "Second", "Third"];

async function readShow(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  return (body as { data: ShowState }).data;
}

export function usePetShow(signedIn: boolean) {
  return useQuery({ queryKey: ["pet-show"], queryFn: () => fetchWithAuth("/pet-show").then(readShow), enabled: signedIn, staleTime: 5 * 60 * 1000 });
}

// Enters what the game says of its best kept cryptlin (only when that's changed since last said)
export function useShowEntry(signedIn: boolean) {
  const queryClient = useQueryClient();
  const said = useRef("");
  const enter = useMutation({
    mutationFn: (kept: Kept) =>
      fetchWithAuth("/pet-show/entry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(kept) }).then(readShow),
    onSuccess: (next) => queryClient.setQueryData(["pet-show"], next),
    onError: () => {
      said.current = "";
    },
  });
  return (kept: Kept) => {
    const word = `${kept.name}|${kept.kind}|${kept.score}`;
    if (!signedIn || word === said.current) return;
    said.current = word;
    enter.mutate(kept);
  };
}

const friday = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "long", hour: "numeric", minute: "2-digit" });

function Standing({ show, small }: { show: ShowState; small: boolean }) {
  const size = small ? "text-[13px]" : "text-sm";
  return (
    <>
      {show.ahead.length > 0 ? (
        <ol className={`mt-2 space-y-0.5 ${size}`} style={typed}>
          {show.ahead.slice(0, small ? 3 : 5).map((entry, i) => (
            <li key={`${entry.keeper}-${entry.petName}`} className={entry.yours ? "font-bold" : undefined}>
              {i + 1}. {entry.petName}, {entry.petKind} <span className="opacity-70">({entry.yours ? "yours" : entry.keeper})</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className={`mt-2 italic opacity-75 ${size}`} style={serif}>
          Nobody has shown one yet this week.
        </p>
      )}
      {show.last && show.last.winners.length > 0 && (
        <p className={`mt-2 opacity-80 ${small ? "text-[12px]" : "text-xs"}`} style={typed}>
          Last Friday: {show.last.winners.map((winner) => `${PLACES[winner.place - 1]}, ${winner.petName} (${winner.keeper})`).join(". ")}.
        </p>
      )}
    </>
  );
}

// On the bulletin board: the show's handbill
export function ShowPaper({ signedIn, goTo }: { signedIn: boolean; goTo: GoTo }) {
  const { data: show } = usePetShow(signedIn);
  const first = show?.prizes[0]?.tickets ?? 1000;
  return (
    <div className="flex h-full flex-col p-3 text-[#2a1d12]">
      <p className="text-center text-[11px] uppercase tracking-[0.25em] opacity-70" style={typed}>
        Every Friday · in the cellar
      </p>
      <p className="mt-1 text-center text-[26px] leading-none" style={serif}>
        Best Kept Cryptlin
      </p>
      <p className="mx-auto mt-2 w-14 border-t-2 border-[#2a1d12]/40" />
      <p className="mt-2 text-center text-[13px] leading-snug" style={serif}>
        It is the week's keeping that is judged, not the morning's. First prize {first.toLocaleString("en-US")} tickets, a rosette and a brass cup.
      </p>
      {show && (
        <div className="mt-1 min-h-0 flex-1 overflow-hidden">
          <p className="mt-2 text-[11px] uppercase tracking-[0.2em] opacity-70" style={typed}>
            Ahead, judged {friday(show.judgedAt)}
          </p>
          <Standing show={show} small />
        </div>
      )}
      <button
        type="button"
        className="mt-2 w-full bg-[#2a1d12] px-2 py-1.5 font-['Pixelify_Sans'] text-[15px] uppercase tracking-[0.08em] text-[#f2ead2] shadow-[2px_2px_0_rgba(0,0,0,0.4)] transition hover:bg-[#3d2b1b]"
        onClick={(event) => {
          event.stopPropagation();
          goTo("cellar");
        }}
      >
        Down to the cellar
      </button>
    </div>
  );
}

// In the pigeonhole, over the letters: the same, as a slip
export function ShowSlip({ goTo }: { goTo: GoTo }) {
  const { data: show } = usePetShow(true);
  if (!show) return null;
  return (
    <div className="mb-4 border-2 border-[#f2ead2]/40 bg-[#1d2a3a] p-3 text-[#f2ead2] shadow-[3px_3px_0_#05070c]">
      <div className="flex items-start gap-3">
        <img src="/pets/cryptlins/rosette1.png" alt="" className="h-12 w-12 shrink-0 [image-rendering:pixelated]" draggable={false} />
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight" style={serif}>
            Best Kept Cryptlin, judged {friday(show.judgedAt)}
          </p>
          <p className="mt-1 text-xs text-[#f2ead2]/70" style={typed}>
            {show.mine ? `${show.mine.petName} is entered. It is the week's keeping that counts.` : "Yours is entered when you next look in on it."} First prize {(show.prizes[0]?.tickets ?? 1000).toLocaleString("en-US")} tickets, a rosette and a brass cup.
          </p>
          <Standing show={show} small={false} />
        </div>
        <button
          type="button"
          onClick={() => goTo("cellar")}
          className="shrink-0 bg-[#efe3c8] px-3 py-2 font-['Pixelify_Sans'] text-[15px] uppercase tracking-[0.08em] text-[#1d2a3a] shadow-[3px_3px_0_rgba(0,0,0,0.6)] transition hover:-translate-y-px hover:bg-[#fff4d8]"
        >
          Cellar
        </button>
      </div>
    </div>
  );
}
