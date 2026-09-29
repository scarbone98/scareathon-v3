import { useEffect } from "react";
import type { Paper } from "./BoardPapers.tsx";

const quiet = "text-[#2a1d14]/70";

// A paper taken down from the board and held up to read; tap outside or Esc to pin it back
export function PaperReader({ paper, onClose }: { paper: Paper | null; onClose: () => void }) {
  useEffect(() => {
    if (!paper) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && (event.stopPropagation(), onClose());
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [paper, onClose]);
  if (!paper) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onClick={onClose} role="dialog" aria-modal aria-label={paper.title}>
      <div
        className="station-lift relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-[2px] p-7 pt-9 shadow-[6px_10px_0_rgba(0,0,0,0.5)]"
        style={{ background: paper.tint, fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" }}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="absolute left-1/2 top-2.5 h-3 w-3 -translate-x-1/2 rounded-full bg-red-800 shadow" aria-hidden />
        <button type="button" onClick={onClose} aria-label="Pin it back" className={`absolute right-3 top-2 text-2xl leading-none ${quiet} hover:text-[#2a1d14]`}>
          ×
        </button>
        {paper.full}
      </div>
    </div>
  );
}
