// Small pieces shared by Mystery Crypt's screens.
import type { ReactNode } from "react";
import { Sprite } from "../../Royale/ui/parts";
import { MOVES, type ItemId, type MoveId, type UnitKind } from "../game/data";
import { UNIT_SHEETS } from "../game/render";

const spriteOf = (kind: UnitKind) => {
  const s = UNIT_SHEETS[kind];
  return { url: s.url, frameWidth: s.fw, frameHeight: s.fh, frames: s.frames, height: 1 };
};

export function UnitSprite({ kind, size, animate = true }: { kind: UnitKind; size: number; animate?: boolean }) {
  return <Sprite sprite={spriteOf(kind)} size={size} fps={7} animate={animate} />;
}

export function MoveIcon({ move, size = 32, dim = false }: { move: MoveId; size?: number; dim?: boolean }) {
  return (
    <img
      src={`/mystery-crypt/${MOVES[move].icon}.png`}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="shrink-0 rounded"
      style={{ imageRendering: "pixelated", opacity: dim ? 0.35 : 1, filter: dim ? "grayscale(1)" : undefined }}
    />
  );
}

const ITEM_ICONS: Record<ItemId, ReactNode> = {
  heart: <Sprite sprite={{ url: "/royale/ui/heart.png", frameWidth: 16, frameHeight: 16, frames: 1, height: 1 }} size={26} />,
  candycorn: <Sprite sprite={{ url: "/sprites/candycornsprite.png", frameWidth: 24, frameHeight: 24, frames: 6, height: 1 }} size={28} />,
  lamp: <Sprite sprite={{ url: "/royale/ui/lamp.png", frameWidth: 16, frameHeight: 64, frames: 4, height: 1 }} size={32} />,
  elixir: <Sprite sprite={{ url: "/mystery-crypt/acid_potion.png", frameWidth: 16, frameHeight: 16, frames: 4, height: 1 }} size={26} style={{ filter: "hue-rotate(80deg) saturate(1.4)" }} />,
};

export function ItemIcon({ item }: { item: ItemId }) {
  return <div className="flex h-8 w-8 shrink-0 items-center justify-center">{ITEM_ICONS[item]}</div>;
}

export function Bar({ value, max, from, to, className = "h-3" }: { value: number; max: number; from: string; to: string; className?: string }) {
  return (
    <div className={`relative flex-1 overflow-hidden rounded-sm border-2 border-[#140a1c] bg-[#140a1c]/70 ${className}`}>
      <div className="h-full transition-[width] duration-150" style={{ width: `${Math.max(0, Math.min(1, value / max)) * 100}%`, background: `linear-gradient(90deg, ${from}, ${to})` }} />
    </div>
  );
}

export function Candy({ amount, className = "" }: { amount: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <Sprite sprite={{ url: "/sprites/candybarsprite.png", frameWidth: 24, frameHeight: 24, frames: 5, height: 1 }} size={18} animate={false} />
      <span className="text-[#ffcf4a]">{amount.toLocaleString()}</span>
    </span>
  );
}

// A dark rounded row, the building block of the camp's lists.
export function Row({ children, className = "", onClick, selected = false }: { children: ReactNode; className?: string; onClick?: () => void; selected?: boolean }) {
  const cls = `flex w-full items-center gap-2 rounded border-2 p-1.5 text-left ${selected ? "border-[#ffcf4a] bg-[#3a2254]" : "border-[#140a1c] bg-[#1c1128]/85"} ${className}`;
  // A div rather than a button, so rows can hold buttons of their own.
  return onClick ? (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`${cls} cursor-pointer`}
    >
      {children}
    </div>
  ) : (
    <div className={cls}>{children}</div>
  );
}
