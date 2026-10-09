import { DEFAULT_KEYS, setKeyboardBindings } from "./ux";
import { idleInput, type Input } from "./sim";
import type { AttackPresentation } from "./contextAttack";
export type InputMode = "keyboard" | "touch" | "gamepad";
let screenAttack: AttackPresentation | undefined;
// React publishes the meaning actually painted on screen. Capture it on the
// physical down event so a late HUD render cannot reinterpret that press.
export function showAttackPresentation(presentation: AttackPresentation) { screenAttack = { action: presentation.action, targetId: presentation.targetId }; }
export class GameInput {
  private bindings = { ...DEFAULT_KEYS };
  setBindings(keys: Record<string, string>) { this.bindings = { ...DEFAULT_KEYS, ...keys }; setKeyboardBindings(keys); this.clear(); }
  private keyMap() {
    const map = Object.fromEntries(Object.entries(this.bindings).filter(([action]) => !['up','down','left','right','pause','map'].includes(action)).map(([action,key]) => [key, action as keyof Input]));
    if (this.bindings.swap === 'q' && !Object.values(this.bindings).includes('e')) map.e = 'swap';
    return map;
  }
  private keys = new Set<string>();
  private touch = idleInput();
  private taps = new Set<keyof Input>();
  private padButtons: boolean[] = [];
  private connected = false;
  private lastNavigate = 0;
  private consumedA = false;
  private padActive = false;
  private attackPresentation: AttackPresentation | undefined;
  mode: InputMode = navigator.maxTouchPoints > 0 ? "touch" : "keyboard";
  constructor(private changed: (mode: InputMode) => void, private pause: () => void, private confirm: () => boolean, private navigate: (direction: number, axis?: "horizontal" | "vertical") => void, private activity: () => void = () => {}) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.clear);
    window.addEventListener("gamepadconnected", this.connect);
    window.addEventListener("gamepaddisconnected", this.disconnect);
  }
  setTouch(input: Partial<Input>) { if (input.attack) this.attackPresentation = input.attackPresentation ?? screenAttack; for (const [action, value] of Object.entries(input)) if (value === true) this.taps.add(action as keyof Input); Object.assign(this.touch, input); this.setMode("touch"); }
  clear = () => { this.keys.clear(); this.touch = idleInput(); this.taps.clear(); this.padButtons = []; this.consumedA = false; this.padActive = false; this.attackPresentation = undefined; };
  private setMode(mode: InputMode) { if (mode !== this.mode) { if (mode !== "touch") { this.touch = idleInput(); this.taps.clear(); } this.mode = mode; this.changed(mode); } }
  private connect = () => { this.connected = true; };
  private disconnect = () => { this.connected = false; this.padButtons = []; this.padActive = false; if (this.mode === "gamepad") this.setMode(navigator.maxTouchPoints > 0 ? "touch" : "keyboard"); };
  private down = (e: KeyboardEvent) => {
    if (!e.repeat) this.activity();
    const key = e.key.toLowerCase();
    const KEY_MAP = this.keyMap();
    this.setMode("keyboard");
    const isMove = [this.bindings.up, this.bindings.down, this.bindings.left, this.bindings.right, "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key);
    if (key !== this.bindings.pause && key !== "escape" && !isMove && !KEY_MAP[key]) return;
    if (key !== "escape" && (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) return;
    if (key === "enter" && e.target instanceof HTMLButtonElement) return;
    if (!e.repeat && ["arrowup", "arrowleft", "arrowdown", "arrowright"].includes(key)) this.navigate(key === "arrowup" || key === "arrowleft" ? -1 : 1, key === "arrowleft" || key === "arrowright" ? "horizontal" : "vertical");
    e.preventDefault(); this.keys.add(key); if (!e.repeat && KEY_MAP[key]) this.taps.add(KEY_MAP[key]);
    if (!e.repeat && KEY_MAP[key] === "attack") this.attackPresentation = screenAttack;
    if (!e.repeat && (key === "escape" || key === this.bindings.pause)) this.pause();
    if (!e.repeat && KEY_MAP[key] === "interact" && this.confirm()) { this.keys.delete(key); this.taps.delete("interact"); }
    if (!e.repeat && KEY_MAP[key] === "attack" && this.confirm()) { this.keys.delete(key); this.taps.delete("attack"); }
  };
  private up = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  read(): Input {
    const has = (key: string, alias: string) => this.keys.has(key) || !Object.values(this.bindings).includes(alias) && this.keys.has(alias);
    const input = { ...this.touch };
    input.x += Number(has(this.bindings.right, "arrowright")) - Number(has(this.bindings.left, "arrowleft"));
    input.y += Number(has(this.bindings.down, "arrowdown")) - Number(has(this.bindings.up, "arrowup"));
    for (const [key, action] of Object.entries(this.keyMap())) {
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
      const active = !!(x || y || pressed.some(Boolean));
      if (active && (!this.padActive || pressed.some((value, index) => value && !this.padButtons[index]))) this.activity();
      this.padActive = active;
      if (active) this.setMode("gamepad");
      if (pressed[9] && !this.padButtons[9]) this.pause();
      if ((x || y) && performance.now() - this.lastNavigate > 210) { this.navigate(Math.sign(Math.abs(x) > Math.abs(y) ? x : y), Math.abs(x) > Math.abs(y) ? "horizontal" : "vertical"); this.lastNavigate = performance.now(); }
      if (!pressed[0]) this.consumedA = false;
      if (pressed[0] && !this.padButtons[0]) this.attackPresentation = screenAttack;
      if (pressed[0] && !this.padButtons[0] && this.confirm()) this.consumedA = true;
      input.x += x; input.y += y;
      input.attack ||= !!pressed[0] && !this.consumedA; input.interact ||= !!pressed[0] && !this.consumedA;
      input.fusion ||= !!pressed[6]; input.ki ||= !!pressed[2]; input.dash ||= !!pressed[1];
      input.guard ||= !!pressed[7] || !!pressed[5]; input.swap ||= !!pressed[4] || !!pressed[3];
      this.padButtons = pressed;
    } else if (this.connected) this.disconnect();
    input.x = Math.max(-1, Math.min(1, input.x)); input.y = Math.max(-1, Math.min(1, input.y));
    if (input.attack) input.attackPresentation = this.attackPresentation;
    return input;
  }
  clearTouch() { this.touch = idleInput(); this.taps.clear(); }
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
