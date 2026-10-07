// The parts both puzzles' pages share: the sign-in card, the archive of past puzzles,
// and the modal they sit in.
import type { ReactNode } from "react";
import { Button, Panel } from "../Royale/ui/parts";
import { LATE_TICKETS, SAME_DAY_TICKETS, dateOfPuzzle, formatPuzzleDate, goSignIn, type Play } from "./api";

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="dp-modal-back" onClick={onClose}>
      <div className="dp-modal" onClick={(e) => e.stopPropagation()}>
        <Panel className="p-5">
          <button type="button" className="dp-close" aria-label="Close" onClick={onClose}>✕</button>
          {children}
        </Panel>
      </div>
    </div>
  );
}

export function SignInCard({ title, pitch }: { title: string; pitch: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <Panel className="max-w-sm p-6 text-center">
        <div className="mb-2 text-2xl font-bold text-[#ffcf4a]">{title}</div>
        <p className="mb-2">{pitch}</p>
        <p className="mb-4 text-sm text-[#a993c0]">
          Sign in to play. Your progress follows you, today's solve pays {SAME_DAY_TICKETS} tickets, and older puzzles from the archive pay {LATE_TICKETS}.
        </p>
        <Button color="orange" onClick={goSignIn}>Sign in</Button>
      </Panel>
    </div>
  );
}

// Every puzzle so far, newest first, with how this player did
export function ArchiveList({ today, plays, current, onPick, describe }: { today: number; plays: Play[]; current: number; onPick: (n: number) => void; describe: (p: Play) => string }) {
  const byNumber = new Map(plays.map((p) => [p.puzzle, p]));
  return (
    <div>
      <div className="mb-1 text-xl font-bold text-[#ffcf4a]">Archive</div>
      <p className="mb-3 text-sm text-[#a993c0]">
        Solve a puzzle on its own day for {SAME_DAY_TICKETS} tickets. Catch up on the ones you missed for {LATE_TICKETS}.
      </p>
      <div className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto pr-1">
        {Array.from({ length: today }, (_, i) => today - i).map((n) => {
          const p = byNumber.get(n);
          const status = !p ? "Not played" : !p.done ? "In progress" : describe(p);
          return (
            <button
              key={n}
              type="button"
              onClick={() => onPick(n)}
              className={`flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left ${n === current ? "bg-[#4a2d63]" : "bg-[#1d1129] hover:bg-[#2c1a3d]"}`}
            >
              <span>
                <b className="text-[#ffcf4a]">#{n}</b> <span className="text-[#a993c0]">{n === today ? "Today" : formatPuzzleDate(dateOfPuzzle(n))}</span>
              </span>
              <span className={`text-sm ${p?.won ? "text-[#ff8a1f]" : "text-[#a993c0]"}`}>
                {status}
                {p?.done && p.tickets ? ` · +${p.tickets} tickets` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
