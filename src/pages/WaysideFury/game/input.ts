import { idleInput, type Input } from "./sim";
export type InputMode = "keyboard" | "touch" | "gamepad";
const KEY_MAP: Record<string, keyof Input> = { j: "attack", k: "ki", l: "dash", shift: "guard", q: "swap", e: "swap", enter: "interact" };
export class GameInput {
  private keys = new Set<string>();
  private touch = idleInput();
  private taps = new Set<keyof Input>();
  private padButtons: boolean[] = [];
  private connected = false;
  mode: InputMode = navigator.maxTouchPoints > 0 ? "touch" : "keyboard";
  constructor(private changed: (mode: InputMode) => void, private pause: () => void, private confirm: () => void) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.clear);
    window.addEventListener("gamepadconnected", this.connect);
    window.addEventListener("gamepaddisconnected", this.disconnect);
  }
  setTouch(input: Partial<Input>) { for (const [action, value] of Object.entries(input)) if (value === true) this.taps.add(action as keyof Input); Object.assign(this.touch, input); this.setMode("touch"); }
  clear = () => { this.keys.clear(); this.touch = idleInput(); this.taps.clear(); this.padButtons = []; };
  private setMode(mode: InputMode) { if (mode !== this.mode) { this.mode = mode; this.changed(mode); } }
  private connect = () => { this.connected = true; };
  private disconnect = () => { this.connected = false; this.padButtons = []; if (this.mode === "gamepad") this.setMode(navigator.maxTouchPoints > 0 ? "touch" : "keyboard"); };
  private down = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    const isMove = ["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key);
    if (key !== "escape" && !isMove && !KEY_MAP[key]) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    this.setMode("keyboard");
    if (key === "enter" && e.target instanceof HTMLButtonElement) return;
    e.preventDefault(); this.keys.add(key); if (!e.repeat && KEY_MAP[key]) this.taps.add(KEY_MAP[key]);
    if (!e.repeat && key === "escape") this.pause();
    if (!e.repeat && key === "enter") this.confirm();
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  read(): Input {
    const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
    const input = { ...this.touch };
    input.x += Number(has("d", "arrowright")) - Number(has("a", "arrowleft"));
    input.y += Number(has("s", "arrowdown")) - Number(has("w", "arrowup"));
    for (const [key, action] of Object.entries(KEY_MAP)) {
      if (this.keys.has(key)) (input[action] as boolean) = true;
    }
    for (const action of this.taps) (input[action] as boolean) = true;
    // Poll even before a connect event: browsers can expose an already paired pad.
    const pads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(pads).find(p => p?.connected && p.mapping === "standard");
    if (pad) {
      this.connected = true;
      const pressed = pad.buttons.map(b => b.pressed || b.value > 0.35);
      const axis = (v: number) => Math.abs(v) < 0.2 ? 0 : Math.sign(v) * (Math.abs(v) - 0.2) / 0.8;
      const x = axis(pad.axes[0] || 0) + Number(pressed[15]) - Number(pressed[14]);
      const y = axis(pad.axes[1] || 0) + Number(pressed[13]) - Number(pressed[12]);
      if (x || y || pressed.some(Boolean)) this.setMode("gamepad");
      if (pressed[9] && !this.padButtons[9]) this.pause();
      if (pressed[0] && !this.padButtons[0]) this.confirm();
      input.x += x; input.y += y;
      input.attack ||= !!pressed[0]; input.interact ||= !!pressed[0];
      input.ki ||= !!pressed[2]; input.dash ||= !!pressed[1];
      input.guard ||= !!pressed[7] || !!pressed[5]; input.swap ||= !!pressed[4] || !!pressed[3];
      this.padButtons = pressed;
    } else if (this.connected) this.disconnect();
    input.x = Math.max(-1, Math.min(1, input.x)); input.y = Math.max(-1, Math.min(1, input.y));
    return input;
  }
  consume() { this.taps.clear(); }
  dispose() {
    this.clear();
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.clear);
    window.removeEventListener("gamepadconnected", this.connect);
    window.removeEventListener("gamepaddisconnected", this.disconnect);
  }
}
