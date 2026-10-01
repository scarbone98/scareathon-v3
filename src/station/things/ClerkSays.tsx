import { Fragment, useEffect, useState } from "react";
import { pixel } from "../style/theme.ts";

// What the thing behind the ticket window says when you walk up: one line, picked at random,
// spelled out a letter at a time in big pixel type over the scene, each letter trembling,
// then gone. (Like a certain cabin-dwelling game master.)
const LINES = [
  "Ah. A passenger.",
  "Tickets. Tickets for the arcade. Tickets for the shop.",
  "The last train left a long time ago.",
  "Don't mind my hand. It wanders.",
  "Mind the gap. Something lives in it.",
  "I've been at this window for a very long time.",
  "You look like you could use a little something from the shop.",
  "No refunds. No exchanges. No escape.",
  "Have you tried the cabinets? Some of them bite.",
  "Every ticket has a price. Most of them are tickets.",
  "Back again? Good. I was getting lonely.",
  "Don't look behind you. Or do. It makes no difference.",
  "The runes on the arch change every night. Have you read them?",
  "Watch your film tonight. The scoreboard is watching you.",
];

const LETTER_MS = 45;
const LINGER_MS = 3200;

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
    <div className="pointer-events-none absolute inset-x-0 bottom-[30%] z-20 flex justify-center px-5 md:bottom-[20%]" aria-live="polite">
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
