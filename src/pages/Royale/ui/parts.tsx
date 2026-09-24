// Shared game-style pieces for Crypt Clash screens. The frames, buttons and
// scenery are sprites from 8 Bit Evil Returns.
import type { CSSProperties, ReactNode } from "react";
import { getCard, type CardSprite } from "../../../../server/shared/royale/index.js";
import { ORANGE, PURPLE, SPRITES } from "./theme";
import "./royale.css";

// An animated sprite sheet, scaled so its longer side is `size` px.
export function Sprite({ sprite, size, fps = 8, animate = true, flip = false, style, className }: { sprite: CardSprite; size: number; fps?: number; animate?: boolean; flip?: boolean; style?: CSSProperties; className?: string }) {
  const { frameWidth: fw, frameHeight: fh, frames, url } = sprite;
  const k = size / Math.max(fw, fh);
  const w = Math.round(fw * k);
  const h = Math.round(fh * k);
  const moving = animate && frames > 1;
  return (
    <div
      className={`${moving ? "cc-sprite" : ""} ${className ?? ""}`}
      style={
        {
          width: w,
          height: h,
          flexShrink: 0,
          backgroundImage: `url(${url})`,
          backgroundSize: `${w * frames}px ${h}px`,
          imageRendering: "pixelated",
          transform: flip ? "scaleX(-1)" : undefined,
          animationDuration: `${frames / fps}s`,
          "--cc-steps": `steps(${frames})`,
          "--cc-strip": `-${w * frames}px`,
          ...style,
        } as CSSProperties
      }
    />
  );
}

const CARD_FRAME: Record<string, number> = { unit: 0, building: 1, spell: 2 };

// A parchment playing card: cost gem, animated art, name ribbon.
export function GameCard({ id, width = 64, animate = true, selected = false, dim = false }: { id: string; width?: number; animate?: boolean; selected?: boolean; dim?: boolean }) {
  const card = getCard(id);
  const h = Math.round(width * 1.5);
  return (
    <div
      className={`relative shrink-0 select-none transition-transform duration-100 ${selected ? "-translate-y-2" : ""}`}
      style={{ width, height: h, filter: `${dim ? "grayscale(0.85) brightness(0.55)" : ""} ${selected ? "drop-shadow(0 0 6px #ffcf4a)" : "drop-shadow(0 3px 0 #0a0510)"}` }}
    >
      <div
        className="cc-pixel absolute inset-0"
        style={{ backgroundImage: "url(/royale/ui/card_frames.png)", backgroundSize: `${width * 4}px ${h}px`, backgroundPosition: `-${CARD_FRAME[card.type] * width}px 0` }}
      />
      <div className="absolute inset-x-0 top-[9%] flex h-[58%] items-center justify-center">
        <Sprite sprite={card.sprite} size={Math.round(width * 0.64)} animate={animate} fps={7} />
      </div>
      <div className="absolute inset-x-[6%] bottom-[7%] rounded-sm bg-[#2a1608]/85 px-0.5 py-[3px] text-center leading-none">
        <span className="block truncate text-[#ffe9c4]" style={{ fontSize: Math.max(8, Math.round(width * 0.14)) }}>
          {card.name}
        </span>
      </div>
      <div
        className="cc-gem cc-outline-sm absolute -left-2 -top-2 flex items-center justify-center rounded-full font-bold text-white"
        style={{ width: Math.round(width * 0.36), height: Math.round(width * 0.36), fontSize: Math.round(width * 0.22) }}
      >
        {card.cost}
      </div>
    </div>
  );
}

type ButtonColor = "orange" | "purple" | "green" | "stone";

export function Button({ children, color = "orange", className = "", ...rest }: { children: ReactNode; color?: ButtonColor; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className={`cc-sbtn cc-sbtn-${color} cc-outline-sm ${className}`}>
      <span className="flex items-center justify-center gap-2">{children}</span>
    </button>
  );
}

export function Panel({ children, gold = false, className = "", style }: { children: ReactNode; gold?: boolean; className?: string; style?: CSSProperties }) {
  return (
    <div className={`cc-spanel ${gold ? "cc-spanel-gold" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}

// A ribbon-style heading.
export function Heading({ children }: { children: ReactNode }) {
  return <div className="cc-outline text-center text-2xl font-bold uppercase tracking-widest text-[#ffcf4a]">{children}</div>;
}

export function Title({ small = false, scale = 1 }: { small?: boolean; scale?: number }) {
  return (
    <div className="cc-bob pointer-events-none text-center" style={{ filter: "drop-shadow(0 0 18px #ff6a0055)" }}>
      <div className="cc-title" style={{ fontSize: (small ? 30 : 46) * scale, color: "#c88cff", textShadow: "0 3px 0 #4a1a7a, 0 6px 0 #140a1c" }}>
        CRYPT
      </div>
      <div className="cc-title" style={{ fontSize: (small ? 48 : 76) * scale, color: ORANGE, textShadow: "0 4px 0 #8a3a00, 0 8px 0 #140a1c, 0 0 24px #ff8a1f66" }}>
        CLASH
      </div>
    </div>
  );
}

// Glowing specks drifting up the screen.
export function Embers({ count = 14 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => {
        const left = (i * 37) % 100;
        const duration = 7 + ((i * 13) % 7);
        const delay = -((i * 29) % 11);
        const drift = ((i * 17) % 60) - 30;
        return (
          <span
            key={i}
            className="cc-ember"
            style={{ left: `${left}%`, color: i % 3 === 0 ? PURPLE : ORANGE, animationDuration: `${duration}s`, animationDelay: `${delay}s`, "--cc-drift": `${drift}px` } as CSSProperties}
          />
        );
      })}
    </div>
  );
}

export function Skulls({ count, active }: { count: number; active: boolean }) {
  return (
    <div className="flex justify-center gap-0.5">
      {Array.from({ length: count }, (_, i) => (
        <Sprite key={i} sprite={SPRITES.skull} size={22} animate={active} style={{ filter: active ? undefined : "grayscale(1) brightness(0.6)" }} />
      ))}
    </div>
  );
}

// A character standing on their little shadow.
export function Character({ sprite, size, flip = false }: { sprite: CardSprite; size: number; flip?: boolean }) {
  return (
    <div className="relative flex flex-col items-center">
      <Sprite sprite={sprite} size={size} flip={flip} fps={7} />
    </div>
  );
}

// The graveyard strip along the bottom of menu screens.
export function Graveyard({ children, scale = 1 }: { children?: ReactNode; scale?: number }) {
  return (
    <div className="pointer-events-none relative w-full" style={{ height: 208 * scale }}>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0b0712] via-[#0b0712cc] to-transparent" />
      <div className="absolute bottom-3 left-1">
        <Sprite sprite={SPRITES.tree} size={120 * scale} style={{ opacity: 0.85 }} />
      </div>
      <div className="absolute bottom-2 right-2">
        <Sprite sprite={SPRITES.tree} size={104 * scale} flip style={{ opacity: 0.85 }} />
      </div>
      <div className="absolute bottom-3 left-[30%]">
        <Sprite sprite={SPRITES.grave} size={46 * scale} />
      </div>
      <div className="absolute bottom-4 right-[27%]">
        <Sprite sprite={SPRITES.grave} size={38 * scale} flip />
      </div>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">
        <Sprite sprite={SPRITES.mausoleum} size={170 * scale} style={{ filter: "brightness(0.8)" }} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0b0712] to-transparent" />
      <div className="absolute inset-x-0 bottom-2 flex items-end justify-center gap-16">{children}</div>
    </div>
  );
}

