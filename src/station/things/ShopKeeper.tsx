import { useEffect, useState } from "react";
import { pixel } from "../style/theme.ts";

// The ticketmaster, minding the item shop: the top of the shop goes off into the dark, his
// eyes are in it, and he has a word about whatever you try on (spelled out a letter at a
// time under them, then gone: as he does when you walk up to the window, see ClerkSays).

// What you've just tried on, as much of it as he has opinions about
export type TriedOn = { name: string; category: string; rarity?: string; price: number; owned?: boolean; short?: boolean };

const ABOUT: Record<string, string[]> = {
  body: ["A new body. Brave.", "It suits you. Worryingly.", "Mind the seams."],
  hair: ["It'll grow out.", "Hair. Hm.", "Don't shed on the counter."],
  head: ["A hat. Bold.", "It hides the worst of it.", "Heads have been lost in that."],
  face_paint: ["It won't wash off.", "An improvement.", "Hold still."],
  face_acc: ["Better. I can't see you.", "Who's under there?", "Keep it on."],
  neck: ["Not too tight, now.", "Snug.", "Mind your neck."],
  torso: ["It fits. Mostly.", "The last owner was your size.", "Hm. Colourful."],
  outer: ["Cold out on the platform.", "Good pockets.", "Check the lining."],
  legs: ["Legs. Two of them.", "They'll do for running.", "Hm. Roomy."],
  feet: ["You'll want to run in those.", "Quiet shoes. Wise.", "Mind the gap."],
  back: ["Watch your back.", "Heavy, that.", "Something's in it."],
  wings: ["No flying in the station.", "They moult.", "Don't knock the lamps."],
  held: ["Don't drop it.", "Careful with that.", "It was holding something else, before."],
  companion: ["It bites.", "It follows you home.", "Feed it. Or don't.", "It's been waiting for you."],
  aura: ["Showy.", "You'll scare the moths.", "That one doesn't come off easily."],
  banner: ["Hang it straight.", "They'll see you coming.", "A fine banner."],
  song: ["I know this one.", "It gets in your head.", "Not too loud.", "They played it at the last stop."],
};
const ANY = ["Hm.", "It's you.", "Interesting.", "Well?", "No refunds."];

function wordFor(item: TriedOn) {
  const pick = (lines: string[]) => lines[Math.floor(Math.random() * lines.length)];
  const roll = Math.random();
  if (item.owned) return pick(["That's yours already.", "You own that.", "Yours. Wear it."]);
  if (item.short && roll < 0.5) return pick(["You can't afford it.", "Not with those tickets.", "Come back richer."]);
  if (item.rarity === "legendary" && roll < 0.6) return pick(["Ah. That one.", "Costly. Good.", "You have taste. Have you tickets?"]);
  if (item.price <= 40 && roll < 0.3) return pick(["Cheap.", "A bargain. Suspicious."]);
  return pick(roll < 0.85 ? ABOUT[item.category] ?? ANY : ANY);
}

const LETTER_MS = 45;
const LINGER_MS = 2600;

// One eye: a slit of sickly light with a thin pupil (the scene's own: StationScene's eyeTexture)
function Eye() {
  return (
    <svg viewBox="0 0 34 16" className="h-[13px] w-[28px] md:h-[16px] md:w-[34px]" aria-hidden>
      <defs>
        <radialGradient id="shopkeeper-eye">
          <stop offset="0" stopColor="#faffbe" />
          <stop offset="0.55" stopColor="#d7f05a" />
          <stop offset="1" stopColor="#a0c828" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <path d="M1 8 Q17 -4 33 8 Q17 20 1 8Z" fill="url(#shopkeeper-eye)" />
      <ellipse cx="17" cy="8" rx="1.4" ry="5.6" fill="#0a0c04" />
    </svg>
  );
}

// (tried: what was last tried on; a new object each time, so the same thing twice gets a
// second word)
export default function ShopKeeper({ tried }: { tried: TriedOn | null }) {
  const [line, setLine] = useState<string | null>(null);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!tried) return;
    const next = wordFor(tried);
    setLine(next);
    setShown(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? next.length : 0);
  }, [tried]);

  useEffect(() => {
    if (!line) return;
    const timer = shown < line.length ? window.setTimeout(() => setShown(shown + 1), line[shown] === " " ? 0 : LETTER_MS) : window.setTimeout(() => setLine(null), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [line, shown]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex h-44 flex-col items-center bg-gradient-to-b from-black via-black/70 to-transparent" aria-hidden={!line}>
      <div className={`shopkeeper-eyes mt-3 flex gap-5 md:gap-6 ${line ? "is-speaking" : ""}`}>
        <span className="shopkeeper-eye">
          <Eye />
        </span>
        <span className="shopkeeper-eye">
          <Eye />
        </span>
      </div>
      {line && (
        <p className="mt-1.5 px-14 text-center text-[13px] leading-tight text-[#f4f1e8] md:text-[15px]" style={{ ...pixel, textShadow: "0 0 6px #000, 0 2px 0 #000, 2px 0 0 #000, -2px 0 0 #000, 0 -2px 0 #000" }} aria-live="polite" aria-label={line}>
          {[...line.slice(0, shown)].map((letter, i) => (
            <span key={i} className="shopkeeper-letter inline-block whitespace-pre" style={{ animationDelay: `${-((i * 137) % 400)}ms` }} aria-hidden>
              {letter}
            </span>
          ))}
        </p>
      )}
      <style>{`
        .shopkeeper-eyes { filter: drop-shadow(0 0 7px rgba(200,255,96,0.55)); animation: shopkeeper-wander 11s ease-in-out infinite; transition: transform .25s }
        .shopkeeper-eyes.is-speaking { animation: none; transform: translateY(3px) }
        .shopkeeper-eye { display: block; animation: shopkeeper-blink 6.3s infinite }
        @keyframes shopkeeper-wander { 0%, 100% { transform: translate(0, 0) } 20% { transform: translate(9px, 1px) } 45% { transform: translate(-7px, 0) } 70% { transform: translate(3px, 2px) } }
        @keyframes shopkeeper-blink { 0%, 95.5%, 100% { transform: scaleY(1) } 97.5% { transform: scaleY(0.08) } }
        @keyframes shopkeeper-tremble { 0%, 100% { transform: translate(0, 0) } 25% { transform: translate(0.5px, -0.5px) } 50% { transform: translate(-0.5px, 0.5px) } 75% { transform: translate(0.5px, 0.5px) } }
        .shopkeeper-letter { animation: shopkeeper-tremble 0.4s steps(2) infinite }
        @media (prefers-reduced-motion: reduce) { .shopkeeper-eyes, .shopkeeper-eye, .shopkeeper-letter { animation: none } }
      `}</style>
    </div>
  );
}
