import type { SaveSettings } from './save.ts';
import { chipEffects } from './u1/items/chips.ts';
import { activeHero, nextPartyHero, type GameState, type Input } from './sim.ts';
export const DEFAULT_KEYS: Record<string, string> = { attack: 'j', ki: 'k', dash: 'l', guard: 'shift', swap: 'q', fusion: 'f', interact: 'enter', up: 'w', down: 's', left: 'a', right: 'd', pause: 'escape', map: 'm' };
let keyboardKeys = { ...DEFAULT_KEYS };
export function setKeyboardBindings(keys: Record<string,string>) { keyboardKeys = { ...DEFAULT_KEYS, ...keys }; }
export function keyboardBinding(action: string) { return keyboardKeys[action]; }
export const DEFAULT_UX: NonNullable<SaveSettings['ux']> = { hudSize: 1, minimalHud: false, textSize: 1, highContrast: true, shapeMarkers: false, haptics: true, gameSpeed: 1, extraHp: 0, keys: {} };
export function actionState(s: GameState, action: keyof Input) {
  const h = activeHero(s), driving = s.scene === 'overworld';
  const combat = !!s.training || ['test', 'arena', 'dungeon', 'realm'].includes(s.scene) && !s.mapId.startsWith('interior-');
  const blocked = !!s.dialogue || !!s.overlay || !!s.film || h.hp <= 0;
  let remaining = 0, duration = 1, unavailable = blocked;
  const kiCost = 8 * chipEffects(s).kiCostMultiplier;
  const needsCharge = action === "ki" && h.ki < kiCost;
  if (action === 'swap') { remaining = s.swapCooldown; duration = .75; unavailable ||= !nextPartyHero(s) || s.dashTimer > 0; }
  if (action === 'dash') { remaining = s.dashTimer; duration = .18; unavailable ||= !driving && combat && h.stamina < 25 * chipEffects(s).dashStaminaMultiplier; }
  if (action === 'guard') unavailable ||= !driving && !combat || s.dashTimer > 0 || s.charge > 0;
  if (action === 'ki') { unavailable ||= !combat; if (needsCharge) { remaining = kiCost - h.ki; duration = kiCost; } }
  if (action === 'attack' && s.contextAttack.target) unavailable = false;
  return { unavailable: unavailable || remaining > 0 && action !== 'ki', cooldown: Math.min(1, remaining / duration), needsCharge };
}
