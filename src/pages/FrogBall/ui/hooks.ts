import { useEffect, useRef, useState, type RefObject } from "react";

export type MenuKey = "up" | "down" | "left" | "right" | "ok" | "back";
export type MenuHandlers = Partial<Record<MenuKey, () => void>>;

const KEYMAP: Record<string, MenuKey> = {
  ArrowUp: "up",
  w: "up",
  W: "up",
  ArrowDown: "down",
  s: "down",
  S: "down",
  ArrowLeft: "left",
  a: "left",
  A: "left",
  ArrowRight: "right",
  d: "right",
  D: "right",
  Enter: "ok",
  " ": "ok",
  z: "ok",
  Z: "ok",
  Escape: "back",
  Backspace: "back",
  x: "back",
  X: "back",
};

// Menu navigation from the keyboard and any gamepad (d-pad or left stick, A
// to confirm, B to go back, Start as confirm), with key repeat on directions.
// Only the menu that's `active` listens.
export function useMenuInput(active: boolean, handlers: MenuHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!active) return;
    const fire = (k: MenuKey) => ref.current[k]?.();
    const onKey = (e: KeyboardEvent) => {
      const k = KEYMAP[e.key];
      if (!k) return;
      e.preventDefault();
      if (e.repeat && (k === "ok" || k === "back")) return;
      fire(k);
    };
    window.addEventListener("keydown", onKey);

    // Gamepads: fire on press, then repeat directions while held.
    const held = new Map<MenuKey, number>();
    let raf = 0;
    // Ignore buttons already down when the menu opened (the press that opened it).
    let armed = false;
    const poll = (now: number) => {
      raf = requestAnimationFrame(poll);
      const down = new Set<MenuKey>();
      for (const p of navigator.getGamepads?.() ?? []) {
        if (!p) continue;
        const ax = p.axes[0] ?? 0;
        const ay = p.axes[1] ?? 0;
        if (p.buttons[12]?.pressed || ay < -0.6) down.add("up");
        if (p.buttons[13]?.pressed || ay > 0.6) down.add("down");
        if (p.buttons[14]?.pressed || ax < -0.6) down.add("left");
        if (p.buttons[15]?.pressed || ax > 0.6) down.add("right");
        if (p.buttons[0]?.pressed || p.buttons[9]?.pressed) down.add("ok");
        if (p.buttons[1]?.pressed) down.add("back");
      }
      if (!armed) {
        if (down.size === 0) armed = true;
        return;
      }
      for (const k of down) {
        const since = held.get(k);
        if (since === undefined) {
          held.set(k, now);
          fire(k);
        } else if (k !== "ok" && k !== "back" && now - since > 380) {
          held.set(k, now - 380 + 110);
          fire(k);
        }
      }
      for (const k of [...held.keys()]) if (!down.has(k)) held.delete(k);
    };
    raf = requestAnimationFrame(poll);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelAnimationFrame(raf);
    };
  }, [active]);
}

// The UI is laid out on a virtual screen at least 640x360 (or 360x640 held
// upright) and scaled to fit, so it looks the same in a small arcade cabinet
// and full screen on a phone.
export function useUiScale(ref: RefObject<HTMLElement>) {
  const [box, setBox] = useState({ w: 640, h: 360, s: 1 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth || 1;
      const H = el.clientHeight || 1;
      const portrait = H > W;
      let s = portrait ? Math.min(W / 360, H / 640) : Math.min(W / 640, H / 360);
      // Whole or half steps keep the 8px font's pixels even.
      s = s >= 2 ? Math.floor(s) : s >= 1 ? Math.floor(s * 2) / 2 : s;
      setBox({ w: W / s, h: H / s, s });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export const isTouchDevice = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
