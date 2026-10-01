// A small admission ticket (the site's currency): drawn in the text colour, with its
// perforation cut out in `perforation`
export default function TicketIcon({ className = "h-5 w-7", perforation = "#1d2a3a" }: { className?: string; perforation?: string }) {
  return (
    <svg viewBox="0 0 24 16" className={className} aria-hidden>
      <path d="M1 3h22v3.2a1.8 1.8 0 0 0 0 3.6V13H1V9.8a1.8 1.8 0 0 0 0-3.6z" fill="currentColor" stroke="currentColor" strokeWidth="1" />
      <path d="M8 3.5v9" stroke={perforation} strokeWidth="1.2" strokeDasharray="1.4 1.2" />
    </svg>
  );
}
