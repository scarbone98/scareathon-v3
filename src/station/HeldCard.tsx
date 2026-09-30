import { useRef, type ReactNode } from "react";
import { PAPER_GRAIN, pixel, sans, typewriter } from "./style/theme.ts";

// Phones: standing at an object, the scene shows the object in the top of the screen and
// this card fills the rest with the thing you're holding (a paper off the board, a flyer
// off the table, the departure board up close, the kiosk's window), full size and usable,
// the way the arcade's terminal card sits under its cabinet. Swipe it, use the arrows,
// or tap another one in the scene to hold that instead.

export type HeldItem = {
  id: string;
  label: string;
  body: ReactNode;
  tone: "paper" | "ledger" | "board";
  tint?: string;
};

type Props = { items: HeldItem[]; index: number; onIndex: (index: number) => void };

const TONES = {
  paper: { text: "text-[#2a1d14]", rule: "border-[#2a1d14]/15", quiet: "text-[#2a1d14]/55", dot: "bg-[#2a1d14]" },
  ledger: { text: "text-stone-200", rule: "border-[#f2ead2]/15", quiet: "text-[#f2ead2]/55", dot: "bg-[#f2ead2]" },
  board: { text: "text-[#ffb03a]", rule: "border-[#ffb03a]/20", quiet: "text-[#ffb03a]/60", dot: "bg-[#ffb03a]" },
};

export default function HeldCard({ items, index, onIndex }: Props) {
  const item = items[Math.min(index, items.length - 1)];
  const swipe = useRef<{ x: number; y: number } | null>(null);
  if (!item) return null;
  const tone = TONES[item.tone];
  const many = items.length > 1;
  const step = (by: number) => onIndex((index + by + items.length) % items.length);

  return (
    <section
      aria-label={item.label}
      className={`station-card absolute inset-x-0 bottom-0 z-10 flex h-[58%] flex-col rounded-t-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.55)] ${tone.text} ${
        item.tone === "ledger" ? "bg-[#0d131b]" : item.tone === "board" ? "bg-[#0a0c10]" : ""
      }`}
      style={{
        backgroundColor: item.tone === "paper" ? item.tint ?? "#f2ead2" : undefined,
        backgroundImage: item.tone === "paper" ? PAPER_GRAIN : undefined,
        ...(item.tone === "paper" ? typewriter : sans),
      }}
      onPointerDown={(event) => {
        swipe.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const start = swipe.current;
        swipe.current = null;
        if (!start || !many) return;
        const dx = event.clientX - start.x;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(event.clientY - start.y) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      <header className={`flex shrink-0 items-center gap-1 border-b px-1.5 pt-1.5 ${tone.rule}`}>
        {many ? (
          <button type="button" aria-label="Previous" onClick={() => step(-1)} className="flex h-11 w-11 items-center justify-center text-2xl" style={pixel}>
            ‹
          </button>
        ) : (
          <span className="w-11" />
        )}
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-[15px] uppercase tracking-[0.12em]" style={pixel}>
            {item.label}
          </p>
          {many && (
            <div className="mt-1 flex justify-center gap-1.5 pb-1.5">
              {items.map((other, i) => (
                <button
                  key={other.id}
                  type="button"
                  aria-label={other.label}
                  aria-current={i === index}
                  onClick={() => onIndex(i)}
                  className={`h-1.5 transition-all ${tone.dot} ${i === index ? "w-5 opacity-80" : "w-1.5 opacity-30"}`}
                />
              ))}
            </div>
          )}
        </div>
        {many ? (
          <button type="button" aria-label="Next" onClick={() => step(1)} className="flex h-11 w-11 items-center justify-center text-2xl" style={pixel}>
            ›
          </button>
        ) : (
          <span className="w-11" />
        )}
      </header>
      <div
        key={item.id}
        className={`station-card-body min-h-0 flex-1 ${item.tone === "board" ? "flex flex-col" : "overflow-y-auto overscroll-contain px-5 pb-6 pt-4"}`}
        style={{ paddingBottom: item.tone === "board" ? "env(safe-area-inset-bottom)" : "max(1.5rem, env(safe-area-inset-bottom))", touchAction: "pan-y" }}
      >
        {item.body}
      </div>
    </section>
  );
}
