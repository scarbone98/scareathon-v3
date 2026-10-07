// The "something new" dot: yellow, with a red "!". The same one the arcade's cartridges wear
// until they're played (Arcade/news.ts), for anything else that's new or waiting: wares in the
// shop, unread mail, a notice not read yet, a place on the scoreboard that's moved.
export default function NewsDot({ className = "", label = "New" }: { className?: string; label?: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-[#3a2a00] bg-[#ffd21f] text-[13px] font-bold leading-none text-[#e0201b] ${className}`}
      style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", boxShadow: "0 0 6px rgba(255, 210, 31, 0.8)", textShadow: "none" }}
    >
      !
    </span>
  );
}
