// Frog Ball co-op screens: host or join, the room code keypad, and the lobby.
import { useEffect, useState, type ReactNode } from "react";
import { roomLink } from "../game/coopNet";
import { sfx } from "../game/sfx";
import { useMenuInput } from "./hooks";
import { Hints, MenuList } from "./menus";
import { ArcadeText, FrogBallSprite } from "./pixels";
import { KEYS } from "./theme";

// Room codes skip letters that look alike (I, O, 0, 1).
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

function Screen({ children }: { children: ReactNode }) {
  return <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1033]/60">{children}</div>;
}

export function CoopMenu({ touch, error, onHost, onJoin, onBack }: { touch: boolean; error: string | null; onHost: () => void; onJoin: () => void; onBack: () => void }) {
  const items = [
    { label: "HOST A ROOM", about: "GET A CODE TO SEND A FRIEND." },
    { label: "JOIN A ROOM", about: "TYPE IN YOUR FRIEND'S CODE." },
    { label: "BACK", about: "" },
  ];
  const [sel, setSel] = useState(0);
  const pick = (i: number) => {
    if (i === 2) {
      sfx.back();
      onBack();
      return;
    }
    sfx.select();
    if (i === 0) onHost();
    else onJoin();
  };
  const move = (d: number) => {
    setSel((s) => (s + d + items.length) % items.length);
    sfx.move();
  };
  useMenuInput(true, { up: () => move(-1), down: () => move(1), ok: () => pick(sel), back: () => pick(2) });
  return (
    <Screen>
      <div className="flex items-center gap-3">
        <FrogBallSprite scale={2} />
        <ArcadeText text="CO-OP" size={40} face="#45e3ff" side="#1f4fb0" depth={5} anim="drop" />
        <FrogBallSprite scale={2} pink />
      </div>
      <p className="fb-o mt-3 max-w-[300px] text-center text-[8px] leading-[12px] text-[var(--cream)]">
        TWO FROGS, ONE CHAIN. EACH OF YOU TIPS YOUR OWN WORLD. PULL AGAINST EACH OTHER AND THE CHAIN YANKS YOU BOTH.
      </p>
      <div className="mt-6">
        <MenuList width={240} items={items.map((it) => ({ label: it.label }))} sel={sel} onHover={setSel} onPick={(i) => (setSel(i), pick(i))} />
      </div>
      <div className="fb-o mt-5 h-3 text-center text-[8px] text-[var(--cyan)]">{items[sel].about}</div>
      {error && <div className="fb-o mt-2 text-center text-[8px] text-[var(--pink)]">{error.toUpperCase()}</div>}
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.updown, "SELECT"], [KEYS.ok, "OK"], [KEYS.back, "BACK"]]} />
        </div>
      )}
    </Screen>
  );
}

// Enter a room code: type it, tap the pad, or walk the pad with a gamepad.
export function JoinCode({ touch, initial, error, busy, onJoin, onBack }: { touch: boolean; initial: string; error: string | null; busy: boolean; onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState(initial.toUpperCase().slice(0, CODE_LENGTH));
  const keys = [...CODE_CHARS, "DEL", "JOIN"];
  const COLS = 8;
  const [sel, setSel] = useState(0);

  const type = (ch: string) => {
    if (ch === "DEL") {
      setCode((c) => c.slice(0, -1));
      sfx.back();
    } else if (ch === "JOIN") {
      if (code.length === CODE_LENGTH && !busy) {
        sfx.select();
        onJoin(code);
      } else sfx.denied();
    } else if (code.length < CODE_LENGTH) {
      setCode((c) => c + ch);
      sfx.letter();
    }
  };

  // Typing on a real keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toUpperCase();
      if (k.length === 1 && CODE_CHARS.includes(k)) {
        e.stopPropagation();
        type(k);
      } else if (e.key === "Backspace") {
        e.stopPropagation();
        type("DEL");
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const move = (dx: number, dy: number) => {
    setSel((s) => {
      const rows = Math.ceil(keys.length / COLS);
      let r = Math.floor(s / COLS) + dy;
      let c = (s % COLS) + dx;
      r = (r + rows) % rows;
      c = (c + COLS) % COLS;
      return Math.min(keys.length - 1, r * COLS + c);
    });
    sfx.move();
  };
  // Enter joins once the code is complete, whatever key the cursor is on.
  useMenuInput(true, {
    up: () => move(0, -1),
    down: () => move(0, 1),
    left: () => move(-1, 0),
    right: () => move(1, 0),
    ok: () => (code.length === CODE_LENGTH && keys[sel] !== "DEL" ? type("JOIN") : type(keys[sel])),
    back: () => (sfx.back(), onBack()),
  });

  return (
    <Screen>
      <ArcadeText text="JOIN A ROOM" size={24} face="#45e3ff" side="#1f4fb0" anim="drop" />
      <div className="mt-4 flex gap-2">
        {Array.from({ length: CODE_LENGTH }, (_, i) => (
          <div key={i} className={`fb-item flex h-[40px] w-[34px] items-center justify-center ${i === code.length ? "is-sel" : ""}`}>
            <span className={`text-[24px] ${i === code.length ? "" : "fb-o"}`}>{code[i] ?? ""}</span>
            {i === code.length && <span className="fb-blink absolute inset-x-[7px] bottom-[5px] h-[2px] bg-[var(--ink)]" />}
          </div>
        ))}
      </div>
      <div className="fb-o mt-2 h-3 text-[8px] text-[var(--pink)]">{busy ? <span className="fb-blink text-[var(--cyan)]">CONNECTING...</span> : error?.toUpperCase()}</div>
      <div className="fb-panel mt-2 grid grid-cols-8 gap-1.5 p-2.5">
        {keys.map((k, i) => (
          <button
            key={k}
            type="button"
            onMouseEnter={() => setSel(i)}
            onClick={() => (setSel(i), type(k))}
            className={`fb-item flex h-[22px] items-center justify-center text-[8px] ${k.length > 1 ? "col-span-2" : "w-[22px]"} ${i === sel ? "is-sel" : ""} ${k === "JOIN" && code.length < CODE_LENGTH ? "is-off" : ""}`}
          >
            <span className={i === sel ? "" : "fb-o"}>{k}</span>
          </button>
        ))}
      </div>
      {!touch ? (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[<span className="fb-key">A-Z</span>, "TYPE"], [KEYS.ok, "JOIN"], [KEYS.back, "BACK"]]} />
        </div>
      ) : (
        <button type="button" onClick={onBack} className="fb-item !absolute left-3 top-3 px-2 py-1.5 text-[8px]">
          BACK
        </button>
      )}
    </Screen>
  );
}

function PlayerSlot({ seat, name, connected, you }: { seat: 0 | 1; name?: string; connected?: boolean; you: boolean }) {
  const color = seat === 0 ? "#8cff5a" : "#ff5fa8";
  return (
    <div className="fb-panel flex w-[132px] flex-col items-center px-2 pb-3 pt-3">
      <span className="fb-o text-[8px]" style={{ color }}>
        PLAYER {seat + 1}
        {you ? " (YOU)" : ""}
      </span>
      <div className={`mt-2 ${name ? "fb-bob" : "opacity-30"}`}>
        <FrogBallSprite scale={2} pink={seat === 1} />
      </div>
      {name ? (
        <>
          <span className="fb-o mt-2 text-[16px] text-white">{name}</span>
          <span className={`fb-o mt-1.5 text-[8px] ${connected ? "text-[var(--lime)]" : "fb-blink text-[var(--pink)]"}`}>{connected ? "READY" : "RECONNECTING"}</span>
        </>
      ) : (
        <>
          <span className="fb-o fb-blink mt-2 text-[16px] text-[var(--cream)]">???</span>
          <span className="fb-o mt-1.5 text-[8px] text-[var(--cream)]">WAITING...</span>
        </>
      )}
    </div>
  );
}

export function Lobby({
  code,
  note,
  seat,
  names,
  connected,
  touch,
  onStart,
  onLeave,
}: {
  code: string;
  note: string | null;
  seat: 0 | 1;
  names: string[];
  connected: boolean[];
  touch: boolean;
  onStart: () => void;
  onLeave: () => void;
}) {
  const host = seat === 0;
  const ready = names.length === 2 && connected.every(Boolean);
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const link = roomLink(code);
    try {
      if (touch && navigator.share) await navigator.share({ title: "Frog Ball co-op", text: `Roll with me in Frog Ball! Room ${code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
      sfx.select();
    } catch {
      // Cancelled or blocked; the code is on screen anyway.
    }
  };
  const items = host ? [{ label: "START", disabled: !ready }, { label: touch ? "SHARE LINK" : copied ? "LINK COPIED" : "COPY LINK" }, { label: "LEAVE" }] : [{ label: "LEAVE" }];
  const [sel, setSel] = useState(0);
  const pick = (i: number) => {
    const label = items[i].label;
    if (label === "START") {
      if (!ready) return sfx.denied();
      sfx.coin();
      onStart();
    } else if (label === "LEAVE") {
      sfx.back();
      onLeave();
    } else void share();
  };
  const move = (d: number) => {
    setSel((s) => (s + d + items.length) % items.length);
    sfx.move();
  };
  useMenuInput(true, { up: () => move(-1), down: () => move(1), ok: () => pick(sel), back: () => pick(items.length - 1) });

  return (
    <Screen>
      <span className="fb-o text-[8px] text-[var(--cream)]">ROOM CODE</span>
      <div className="mt-2">
        <ArcadeText text={code} size={40} face="#ffd23f" side="#c2560a" depth={5} anim="drop" />
      </div>
      <span className="fb-o mt-1 text-[8px] text-[var(--cyan)]">{host ? "SEND THIS CODE TO A FRIEND" : "YOU'RE IN! WAITING FOR THE HOST"}</span>
      {note && <span className="fb-o mt-1.5 text-[8px] text-[var(--pink)]">{note}</span>}
      <div className="mt-4 flex max-w-[600px] flex-wrap items-center justify-center gap-x-6 gap-y-4">
        <div className="flex gap-3">
          <PlayerSlot seat={0} name={names[0]} connected={connected[0]} you={seat === 0} />
          <PlayerSlot seat={1} name={names[1]} connected={connected[1]} you={seat === 1} />
        </div>
        <div className="flex flex-col items-center gap-3">
          <MenuList width={200} items={items} sel={Math.min(sel, items.length - 1)} onHover={setSel} onPick={(i) => (setSel(i), pick(i))} />
          {!host && <span className="fb-o fb-blink text-[8px] text-[var(--cream)]">WAITING FOR {names[0] ?? "P1"}...</span>}
        </div>
      </div>
      {!touch && (
        <div className="absolute inset-x-0 bottom-3">
          <Hints items={[[KEYS.updown, "SELECT"], [KEYS.ok, "OK"], [KEYS.back, "LEAVE"]]} />
        </div>
      )}
    </Screen>
  );
}
