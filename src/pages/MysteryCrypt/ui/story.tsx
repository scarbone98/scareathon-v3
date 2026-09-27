// The story's on-screen pieces: the dialogue box, chapter cards and the fade.
import { useEffect, useRef, useState } from "react";
import { Sprite } from "../../Royale/ui/parts";
import type { Dialogue } from "../game/controller";
import { PROP_SHEETS } from "../game/render";
import { FACES } from "../game/story";
import { UnitSprite } from "./parts";

// Letters appear this many per second; a tap shows the rest, the next tap moves on.
const TYPE_SPEED = 55;

function Portrait({ dialogue }: { dialogue: Dialogue }) {
  if (dialogue.portrait) {
    const frame = Math.max(0, FACES.indexOf(dialogue.face));
    return (
      <div
        className="h-12 w-12"
        style={{ backgroundImage: `url(/mystery-crypt/portraits/${dialogue.portrait}.png)`, backgroundPosition: `-${frame * 48}px 0`, backgroundSize: `${48 * FACES.length}px 48px`, imageRendering: "pixelated" }}
      />
    );
  }
  if (dialogue.kind) return <UnitSprite kind={dialogue.kind} size={44} />;
  const def = dialogue.sprite ? PROP_SHEETS[dialogue.sprite as keyof typeof PROP_SHEETS] : null;
  if (!def) return null;
  return <Sprite sprite={{ url: def.url, frameWidth: def.fw, frameHeight: def.fh, frames: def.frames, height: 1 }} size={52} fps={6} />;
}

export function DialogueBox({ dialogue, onNext, keyRef }: { dialogue: Dialogue; onNext: () => void; keyRef: { current: (() => void) | null } }) {
  const [shown, setShown] = useState(0);
  const start = useRef(performance.now());
  const done = shown >= dialogue.text.length;

  useEffect(() => {
    start.current = performance.now();
    setShown(0);
    let raf = 0;
    const tick = () => {
      const n = Math.floor(((performance.now() - start.current) / 1000) * TYPE_SPEED);
      setShown(Math.min(n, dialogue.text.length));
      if (n < dialogue.text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dialogue]);

  const tap = () => {
    if (done) onNext();
    else {
      start.current = -1e9;
      setShown(dialogue.text.length);
    }
  };
  keyRef.current = tap;

  const narrator = !dialogue.name;
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" onPointerDown={tap}>
      <div className="mc-msg mx-2 mb-3 flex min-h-[112px] gap-2 rounded-lg border-[3px] border-[#140a1c] bg-[#1c1128]/95 p-2.5 shadow-[0_0_0_2px_#6b5690_inset]">
        {!narrator && <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded bg-[#0b0712]">
          <Portrait dialogue={dialogue} />
        </div>}
        <div className="min-w-0 flex-1">
          {!narrator && (
            <div className="cc-outline-sm text-sm" style={{ color: dialogue.color }}>
              {dialogue.name}
            </div>
          )}
          <p className={`cc-outline-sm leading-snug ${narrator ? "text-center italic text-[#c8b8ff]" : "text-white"} text-[15px]`}>
            {dialogue.text.slice(0, shown)}
            <span className="invisible">{dialogue.text.slice(shown)}</span>
          </p>
        </div>
        <div className={`self-end text-[#ffcf4a] ${done ? "animate-bounce" : "opacity-0"}`}>▼</div>
      </div>
    </div>
  );
}

export function StoryCard({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0b0712]/70 px-6 text-center">
      <div className="cc-pop cc-title" style={{ fontSize: 46, color: "#ffcf4a", textShadow: "0 4px 0 #8a5a00, 0 8px 0 #140a1c" }}>
        {title}
      </div>
      {sub && (
        <div className="cc-pop cc-outline mt-2 text-xl text-[#e8dcff]" style={{ animationDelay: "0.2s" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function Fade({ dark }: { dark: boolean }) {
  return <div className="pointer-events-none absolute inset-0 z-10 bg-black transition-opacity duration-700" style={{ opacity: dark ? 1 : 0 }} />;
}
