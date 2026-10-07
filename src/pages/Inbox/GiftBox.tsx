import { useEffect, useRef, useState } from "react";

// A gift in the inbox: a wrapped present, not a line saying what's in it. Opening it is the
// claim, with a bit of ceremony: the box rattles while the server's asked (and for a beat
// longer, so it's never over before it's begun), then the lid goes, the light comes out, and
// what was in it rises up with its name and how rare it is.

export type GiftItem = { name: string; icon: string; rarity?: string | null; category?: string | null };

const RATTLE_MS = 1300;
// Pieces of ribbon and paper thrown out when it opens: an angle, how far, a colour, a delay
const CONFETTI = Array.from({ length: 18 }, (_, n) => ({
  angle: (n * 360) / 18 + (n % 2 ? 9 : -6),
  far: 62 + ((n * 37) % 46),
  colour: ["#ffd24a", "#ff5a7a", "#7dffd0", "#b45cff", "#ff9a3a", "#f2ead2"][n % 6],
  delay: (n % 5) * 30,
  wide: n % 3 === 0,
}));

// The present, in big pixels: a box, a lid that comes off on its own, a ribbon and a bow
function Present() {
  return (
    <svg viewBox="0 0 32 32" shapeRendering="crispEdges" className="gift-present" aria-hidden>
      <g className="gift-body">
        <rect x="5" y="15" width="22" height="14" fill="#6b3fa0" />
        <rect x="5" y="15" width="22" height="2" fill="#4d2c78" />
        <rect x="23" y="17" width="4" height="12" fill="#58328a" />
        <rect x="14" y="15" width="4" height="14" fill="#f2a03a" />
        <rect x="14" y="15" width="1" height="14" fill="#ffc46a" />
      </g>
      <g className="gift-lid">
        <rect x="3" y="10" width="26" height="6" fill="#8250c4" />
        <rect x="3" y="10" width="26" height="1" fill="#a274e0" />
        <rect x="25" y="11" width="4" height="5" fill="#6b3fa0" />
        <rect x="14" y="10" width="4" height="6" fill="#f2a03a" />
        <rect x="14" y="10" width="1" height="6" fill="#ffc46a" />
        {/* the bow: two loops and the knot */}
        <rect x="9" y="5" width="5" height="5" fill="#f2a03a" />
        <rect x="10" y="6" width="3" height="3" fill="#8250c4" />
        <rect x="18" y="5" width="5" height="5" fill="#f2a03a" />
        <rect x="19" y="6" width="3" height="3" fill="#8250c4" />
        <rect x="14" y="6" width="4" height="4" fill="#ffc46a" />
      </g>
    </svg>
  );
}

export default function GiftBox({
  item,
  isClaiming,
  error,
  onOpen,
}: {
  // what was in it, once the server's said (it stays wrapped until then)
  item: GiftItem | null;
  isClaiming: boolean;
  error: string | null;
  onOpen: () => void;
}) {
  const [phase, setPhase] = useState<"wrapped" | "rattling" | "open">("wrapped");
  const startedAt = useRef(0);

  // It opens when the item's come back and it's rattled long enough
  useEffect(() => {
    if (phase !== "rattling" || !item) return;
    const wait = Math.max(0, RATTLE_MS - (Date.now() - startedAt.current));
    const timer = window.setTimeout(() => setPhase("open"), wait);
    return () => window.clearTimeout(timer);
  }, [phase, item]);
  // The claim failed: wrapped again, to try once more
  useEffect(() => {
    if (error && phase === "rattling" && !isClaiming) setPhase("wrapped");
  }, [error, isClaiming, phase]);

  const open = () => {
    if (phase !== "wrapped") return;
    startedAt.current = Date.now();
    setPhase("rattling");
    onOpen();
  };

  const rarity = (item?.rarity || "common").toLowerCase();
  return (
    <div className={`gift is-${phase} gift-rarity-${rarity}`}>
      <div className="gift-stage">
        {phase === "open" && (
          <>
            <span className="gift-rays" aria-hidden />
            <span className="gift-flash" aria-hidden />
            {CONFETTI.map((piece, n) => (
              <span
                key={n}
                className={`gift-confetti ${piece.wide ? "is-wide" : ""}`}
                style={{ "--angle": `${piece.angle}deg`, "--far": `${piece.far}px`, background: piece.colour, animationDelay: `${piece.delay}ms` } as React.CSSProperties}
                aria-hidden
              />
            ))}
          </>
        )}
        <Present />
        {phase === "open" && item && <img className="gift-item" src={item.icon} alt="" draggable={false} />}
      </div>
      {phase === "open" && item ? (
        <div className="gift-reveal" role="status">
          <span className="gift-rarity">{rarity}</span>
          <strong className="gift-name">{item.name}</strong>
          <span className="gift-done">It's in your locker</span>
        </div>
      ) : (
        <button type="button" className="inbox-primary-button gift-open" onClick={open} disabled={phase !== "wrapped"}>
          {phase === "rattling" ? "Opening…" : "Open your gift"}
        </button>
      )}
      {error && phase === "wrapped" && <p className="inbox-error inbox-reward-error">{error}</p>}
    </div>
  );
}
