// Menu lists in the style of an early-2000s console: a column of spaced-out caps with a glowing bar
// on the chosen line. Arrow keys and Enter work, so does the mouse, so does a thumb.
import { useEffect, useRef, useState } from "react";
import { sfx } from "./game/sfx";

export interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  // Rows with a value are settings: left and right change it.
  value?: string;
  disabled?: boolean;
}

const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);

function useListKeys(count: () => number, isDisabled: (i: number) => boolean, handlers: { pick: (i: number) => void; left?: (i: number) => void; right?: (i: number) => void; back?: () => void }, active: boolean) {
  const [sel, setSel] = useState(() => {
    const n = count();
    for (let i = 0; i < n; i++) if (!isDisabled(i)) return i;
    return 0;
  });
  const selRef = useRef(sel);
  selRef.current = sel;
  const h = useRef(handlers);
  h.current = handlers;
  const countRef = useRef(count);
  countRef.current = count;
  const disabledRef = useRef(isDisabled);
  disabledRef.current = isDisabled;

  const move = (d: number) => {
    const n = countRef.current();
    if (!n) return;
    let i = selRef.current;
    for (let k = 0; k < n; k++) {
      i = (i + d + n) % n;
      if (!disabledRef.current(i)) break;
    }
    setSel(i);
    sfx.tick();
  };

  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const i = Math.min(selRef.current, Math.max(0, countRef.current() - 1));
      let handled = true;
      if (e.code === "ArrowUp") move(-1);
      else if (e.code === "ArrowDown") move(1);
      else if (e.code === "ArrowLeft" && h.current.left) h.current.left(i);
      else if (e.code === "ArrowRight" && h.current.right) h.current.right(i);
      else if ((e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") && !disabledRef.current(i)) {
        sfx.unlock();
        sfx.confirm();
        h.current.pick(i);
      } else if (e.code === "Escape" && h.current.back) {
        sfx.tick();
        h.current.back();
      } else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [active]);

  return { sel, setSel };
}

export function MenuList({
  items,
  onPick,
  onLeft,
  onRight,
  onBack,
  active = true,
}: {
  items: MenuItem[];
  onPick: (key: string) => void;
  onLeft?: (key: string) => void;
  onRight?: (key: string) => void;
  onBack?: () => void;
  active?: boolean;
}) {
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const { sel, setSel } = useListKeys(
    () => itemsRef.current.length,
    (i) => !!itemsRef.current[i]?.disabled,
    {
      pick: (i) => {
        const it = itemsRef.current[i];
        if (!it) return;
        // A setting row: Enter nudges it along.
        if (it.value !== undefined && onRight) onRight(it.key);
        else onPick(it.key);
      },
      left: onLeft ? (i) => itemsRef.current[i]?.value !== undefined && onLeft(itemsRef.current[i].key) : undefined,
      right: onRight ? (i) => itemsRef.current[i]?.value !== undefined && onRight(itemsRef.current[i].key) : undefined,
      back: onBack,
    },
    active,
  );
  return (
    <div className="hr-menu">
      {items.map((it, i) => (
        <button
          key={it.key}
          type="button"
          disabled={it.disabled}
          className={`hr-menu-item ${i === sel ? "sel" : ""}`}
          onMouseEnter={() => {
            if (i !== sel && !it.disabled) {
              setSel(i);
              sfx.tick();
            }
          }}
          onClick={() => {
            sfx.unlock();
            setSel(i);
            sfx.confirm();
            if (it.value !== undefined && onRight) onRight(it.key);
            else onPick(it.key);
          }}
        >
          {it.label}
          {it.value !== undefined && <span className="hr-menu-value">◂ {it.value} ▸</span>}
          {it.hint && <small>{it.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export interface RoomRow {
  code: string;
  host: string;
  level: string;
  seats: number;
  humans: number;
  status: string;
}

// The open rafts: one line each, with the seats shown as little lamps.
export function RoomRows({ rooms, onJoin, onBack, active = true }: { rooms: RoomRow[]; onJoin: (code: string) => void; onBack?: () => void; active?: boolean }) {
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;
  const { sel, setSel } = useListKeys(
    () => roomsRef.current.length,
    () => false,
    { pick: (i) => roomsRef.current[i] && onJoin(roomsRef.current[i].code), back: onBack },
    active,
  );
  return (
    <div className="hr-menu" style={{ minWidth: "min(34rem, 88vw)" }}>
      {rooms.map((r, i) => (
        <button
          key={r.code}
          type="button"
          className={`hr-menu-item ${i === sel ? "sel" : ""}`}
          style={{ letterSpacing: "0.1em", fontSize: "0.95rem" }}
          onMouseEnter={() => i !== sel && (setSel(i), sfx.tick())}
          onClick={() => {
            sfx.unlock();
            sfx.confirm();
            onJoin(r.code);
          }}
        >
          <span className="inline-block w-[38%] truncate align-middle">{r.host}</span>
          <span className="inline-block w-[34%] truncate align-middle text-[0.8em] opacity-80">{r.level}</span>
          <span className="inline-block w-[28%] text-right align-middle">
            <span className="mr-2 text-[0.7em] opacity-70">{r.status === "lobby" ? "DOCK" : "RIVER"}</span>
            {Array.from({ length: r.seats }, (_, k) => (k < r.humans ? "●" : "○")).join(" ")}
          </span>
        </button>
      ))}
    </div>
  );
}
