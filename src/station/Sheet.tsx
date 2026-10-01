import { useEffect, useRef, type ReactNode } from "react";
import { PAPER_GRAIN, pixel, sans, typewriter } from "./style/theme.ts";

// Something taken up to look at closely: a paper off the board, a flyer off the table,
// the departure board or the kiosk's window up close, a catalogue slid across the counter.
// On phones it slides up from the bottom and fills most of the screen; on wider screens
// it's held up in the middle. Tap outside, ×, or Esc to put it back.

export type SheetContent = {
  id: string;
  title: string; // for screen readers
  body: ReactNode;
  // paper: cream, pinned. ledger: navy, wide, for the kiosk's catalogue.
  // board: the departure board's own black face, edge to edge.
  tone?: "paper" | "ledger" | "board";
  // Takes the whole screen (the wardrobe: the clothes and you in them, side by side); its
  // body does its own scrolling
  full?: boolean;
  tint?: string;
};

export default function Sheet({ sheet, onClose }: { sheet: SheetContent | null; onClose: () => void }) {
  // The tap that picked something up is followed by its own click, which would land on
  // the backdrop that just appeared under the finger; ignore the backdrop briefly
  const openedAt = useRef(0);
  const isOpen = Boolean(sheet);
  useEffect(() => {
    if (isOpen) openedAt.current = performance.now();
  }, [isOpen]);
  const closeFromBackdrop = () => performance.now() - openedAt.current > 400 && onClose();

  useEffect(() => {
    if (!sheet) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [sheet, onClose]);
  if (!sheet) return null;
  const tone = sheet.tone ?? "paper";
  const full = Boolean(sheet.full);

  const toneClass = {
    paper: "md:max-w-lg p-6 pt-9 md:p-7 md:pt-9",
    ledger: "md:max-w-4xl bg-[#0d131b] p-5 pt-12 text-stone-200 ring-2 ring-inset ring-[#f2ead2]/40 md:p-8 md:pt-12",
    board: "md:max-w-3xl bg-[#0a0c10] pt-10 ring-2 ring-inset ring-[#ffb03a]/25",
  }[tone];
  const light = tone === "paper";

  return (
    <div
      className={`fixed inset-0 z-30 flex items-end justify-center bg-black/60 backdrop-blur-[2px] md:items-center ${full ? "" : "md:p-6"}`}
      onClick={closeFromBackdrop}
      role="dialog"
      aria-modal
      aria-label={sheet.title}
    >
      <div
        className={`station-sheet relative flex w-full flex-col ${
          full
            ? "h-[100dvh] overflow-hidden"
            : "max-h-[90dvh] overflow-y-auto overscroll-contain rounded-t-2xl shadow-[0_-8px_30px_rgba(0,0,0,0.5)] md:max-h-[88vh] md:rounded-[3px] md:shadow-[6px_10px_0_rgba(0,0,0,0.5)]"
        } ${full ? toneClass.replace(/md:max-w-\S+/, "") : toneClass}`}
        style={{
          backgroundColor: light ? sheet.tint ?? "#f2ead2" : undefined,
          backgroundImage: light ? PAPER_GRAIN : undefined,
          ...(light ? typewriter : sans),
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* A grab handle on phones; a pin on paper on wider screens */}
        <span className={`absolute left-1/2 top-2.5 h-1.5 w-12 -translate-x-1/2 rounded-full md:hidden ${full ? "hidden" : ""} ${light ? "bg-[#2a1d14]/25" : "bg-[#f2ead2]/30"}`} aria-hidden />
        {light && <span className="absolute left-1/2 top-2.5 hidden h-3 w-3 -translate-x-1/2 rounded-full bg-red-800 shadow md:block" aria-hidden />}
        <button
          type="button"
          onClick={onClose}
          aria-label="Put it back"
          style={pixel}
          className={`absolute right-2 top-1 flex h-11 w-11 items-center justify-center text-3xl leading-none ${light ? "text-[#2a1d14]/60 hover:text-[#2a1d14]" : "text-[#f2ead2]/70 hover:text-[#f2ead2]"}`}
        >
          ×
        </button>
        {tone === "board" ? <div className="h-[70dvh] md:h-[60vh]">{sheet.body}</div> : full ? <div className="min-h-0 flex-1">{sheet.body}</div> : sheet.body}
      </div>
    </div>
  );
}
