import { Fragment, useEffect, useState } from "react";
import { pixel } from "../style/theme.ts";

// What the thing behind the ticket window says when you walk up: one line, picked at random,
// spelled out a letter at a time in big pixel type over the scene, each letter trembling,
// then gone. (Like a certain cabin-dwelling game master.)
const LINES = [
  "Ah. You.",
  "Tickets.",
  "Buy something.",
  "No refunds.",
  "Mind the gap.",
  "Still here?",
  "Don't stare.",
  "Read the runes.",
  "The train is late.",
  "Back again.",
  "Hm.",
  "Spend them.",
];

const LETTER_MS = 70;
const LINGER_MS = 2400;

export default function ClerkSays({ arrived }: { arrived: boolean }) {
  const [line, setLine] = useState<string | null>(null);
  const [shown, setShown] = useState(0);

  // A fresh line each time you walk up
  useEffect(() => {
    if (!arrived) {
      setLine(null);
      return;
    }
    const next = LINES[Math.floor(Math.random() * LINES.length)];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLine(next);
    setShown(reduced ? next.length : 0);
  }, [arrived]);

  // Spelled out a letter at a time, then left to linger, then gone
  useEffect(() => {
    if (!line) return;
    const timer = shown < line.length ? window.setTimeout(() => setShown(shown + 1), line[shown] === " " ? 0 : LETTER_MS) : window.setTimeout(() => setLine(null), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [line, shown]);

  if (!line) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[26%] z-20 flex justify-center px-5 md:bottom-[16%]" aria-live="polite">
      <p className="max-w-[36rem] text-center text-[26px] leading-snug text-[#f4f1e8] [word-spacing:0.35em] md:text-[34px]" style={{ ...pixel, textShadow: "0 0 6px #000, 0 2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000" }} aria-label={line}>
        {/* (word by word, so a word never breaks across lines; letter by letter within) */}
        {line
          .slice(0, shown)
          .split(" ")
          .map((word, w) => (
            <Fragment key={w}>
              {w > 0 && " "}
              <span className="inline-block whitespace-nowrap" aria-hidden>
                {[...word].map((letter, i) => (
                  <span key={i} className="clerk-letter inline-block" style={{ animationDelay: `${-(((w * 7 + i) * 137) % 400)}ms` }}>
                    {letter}
                  </span>
                ))}
              </span>
            </Fragment>
          ))}
      </p>
      <style>{`
        @keyframes clerk-tremble { 0%, 100% { transform: translate(0, 0) } 25% { transform: translate(0.5px, -1px) } 50% { transform: translate(-0.5px, 0.5px) } 75% { transform: translate(0.5px, 1px) } }
        .clerk-letter { animation: clerk-tremble 0.4s steps(2) infinite }
        @media (prefers-reduced-motion: reduce) { .clerk-letter { animation: none } }
      `}</style>
    </div>
  );
}
