import type { GameState, HeroId, HeroState, RemoteHero } from '../../sim.ts';
import { cleanFusionWorld, createFusionWorld, elapsedFusionWorld, FUSION_COOLDOWN, FUSION_DURATION, FUSION_INTENT, FUSION_RANGE,
  type FusionForm, type FusionWorld } from '../../../../../../server/shared/waysideFury/u1Fusion.js';
export { elapsedFusionWorld, FUSION_COOLDOWN, FUSION_DURATION, FUSION_INTENT, FUSION_RANGE };
export type { FusionForm, FusionWorld };

export interface FusionRuntime {
  world: FusionWorld; intent: number; specialRequest: number; cooldown: number; seat: number;
  appliedIds: number[]; spentSpecialIds: number[]; lastAppliedId: number;
}
export interface FusionStatus { label: string; ready: boolean; reason: string; cooldown: number; intent: number }
type Participant = { seat: number; hero: HeroState; x: number; y: number; scene: GameState['scene']; room: number; intent: number; downed?: boolean };
const heroNames: Record<HeroId, string> = { you: 'You', joe: 'Joe', matt: 'Matt', alex: 'Alex', jon: 'Jon' };
const seatOf = (s: GameState) => s.coop?.seat ?? 0;
const fusionScenes = new Set<string>(['test', 'dungeon', 'realm', 'arena']);
const combatScene = (scene: GameState['scene']): scene is Extract<GameState['scene'], FusionForm['scene']> => fusionScenes.has(scene);
const alive = (hero: HeroState, downed?: boolean) => !downed && Number.isFinite(hero.hp) && hero.hp > 0;
const fullKi = (hero: HeroState) => Number.isFinite(hero.ki) && Number.isFinite(hero.maxKi) && hero.maxKi > 0 && hero.ki >= hero.maxKi - 0.000001;
const uniqueSeats = (form: FusionForm) => [...new Set(form.seats)];
const remember = (ids: number[], id: number) => { if (!ids.includes(id)) ids.push(id); if (ids.length > 64) ids.splice(0, ids.length - 64); };

export function createFusionRuntime(): FusionRuntime {
  return { world: createFusionWorld(), intent: 0, specialRequest: 0, cooldown: 0, seat: 0, appliedIds: [], spentSpecialIds: [], lastAppliedId: 0 };
}
export function localFusion(s: GameState, seat = seatOf(s)): FusionForm | undefined {
  return s.fusion.world.forms.find(form => {
    if (form.remaining <= 0 || !form.seats.includes(seat) || form.scene !== s.scene || form.room !== s.room) return false;
    if (seat !== seatOf(s)) return true;
    const index = form.seats.indexOf(seat);
    return s.active === form.heroes[index] && alive(s.heroes[s.active], s.coop?.downed)
      && (form.mode !== 'solo' || form.heroes.every(id => alive(s.heroes[id])));
  });
}
function cooldownFor(s: GameState, seat = seatOf(s)) {
  return Math.max(s.fusion.world.cooldowns[seat] ?? 0, seat === seatOf(s) ? s.fusion.cooldown : 0);
}
function localParticipant(s: GameState): Participant {
  return { seat: seatOf(s), hero: s.heroes[s.active], x: s.x, y: s.y, scene: s.scene, room: s.room, intent: s.fusion.intent, downed: s.coop?.downed };
}
function participants(s: GameState): Participant[] {
  const found = [localParticipant(s)], used = new Set([seatOf(s)]);
  for (const remote of s.coop?.remoteHeroes ?? []) {
    if (!Number.isInteger(remote.seat) || remote.seat < 0 || remote.seat > 3 || used.has(remote.seat)) continue;
    used.add(remote.seat); found.push({ ...remote, intent: remote.fusionIntent ?? 0 });
  }
  return found.sort((a, b) => a.seat - b.seat);
}
function soloPartner(s: GameState): HeroId | undefined {
  const index = s.party.indexOf(s.active);
  for (let offset = 1; offset <= s.party.length; offset++) {
    const id = s.party[(index + offset) % s.party.length];
    if (id !== s.active && alive(s.heroes[id])) return id;
  }
  return undefined;
}
export function fusionStatus(s: GameState): FusionStatus {
  const form = localFusion(s), cooldown = cooldownFor(s), intent = s.fusion.intent;
  if (form) return { label: `${heroNames[form.heroes[0]]} + ${heroNames[form.heroes[1]]}`, ready: false, reason: form.specialUsed ? 'Special spent' : form.mode === 'coop' && form.seats[0] !== seatOf(s) ? 'Partner leads the special' : 'Ki releases the fusion special', cooldown, intent };
  if (!combatScene(s.scene)) return { label: 'Fusion', ready: false, reason: 'Available in combat areas', cooldown, intent };
  if (!alive(s.heroes[s.active], s.coop?.downed)) return { label: 'Fusion', ready: false, reason: 'A living hero is required', cooldown, intent };
  if (cooldown > 0) return { label: 'Fusion', ready: false, reason: `Recovering ${Math.ceil(cooldown)}s`, cooldown, intent };
  if (!fullKi(s.heroes[s.active])) return { label: 'Fusion', ready: false, reason: 'Charge your Ki to full', cooldown, intent };
  if (s.coop) return { label: intent > 0 ? 'Fusion ready' : 'Fuse', ready: true, reason: intent > 0 ? 'Waiting for a nearby teammate' : 'A nearby teammate must also trigger Fusion', cooldown, intent };
  const partner = soloPartner(s);
  if (!partner || !alive(s.heroes[partner])) return { label: 'Fusion', ready: false, reason: 'Your next tag partner must be alive', cooldown, intent };
  if (!fullKi(s.heroes[partner])) return { label: 'Fusion', ready: false, reason: `Charge ${heroNames[partner]}'s Ki to full`, cooldown, intent };
  return { label: 'Fuse', ready: true, reason: `${heroNames[s.active]} + ${heroNames[partner]} • 12s`, cooldown, intent };
}
function applyLocalActivation(s: GameState, form: FusionForm) {
  const index = form.seats.indexOf(seatOf(s));
  if (index < 0 || form.id <= s.fusion.lastAppliedId || s.fusion.appliedIds.includes(form.id)) return;
  const ids = form.mode === 'solo' ? form.heroes : [form.heroes[index]];
  for (const id of ids) s.heroes[id].ki = 0;
  s.fusion.intent = 0; s.fusion.specialRequest = 0;
  s.fusion.lastAppliedId = form.id; remember(s.fusion.appliedIds, form.id);
  s.events.push({ type: 'fusion-start', id: form.id, heroes: [...form.heroes], seats: [...form.seats] });
}
function startForm(s: GameState, form: Omit<FusionForm, 'id' | 'remaining' | 'specialUsed'>) {
  if (s.fusion.world.nextId >= 100_000_000) return false;
  const active: FusionForm = { ...form, id: s.fusion.world.nextId++, remaining: FUSION_DURATION, specialUsed: false };
  s.fusion.world.forms.push(active); applyLocalActivation(s, active);
  if (active.mode === 'coop') {
    for (const remote of s.coop?.remoteHeroes ?? []) {
      if (active.seats.includes(remote.seat)) { remote.hero.ki = 0; remote.fusionIntent = 0; }
    }
  }
  return true;
}
function tryPair(s: GameState) {
  if (s.coop?.role !== 'host' || !combatScene(s.scene)) return;
  const ready = participants(s).filter(p => p.scene === s.scene && p.room === s.room && p.intent > 0 && alive(p.hero, p.downed) && fullKi(p.hero) && !localFusion(s, p.seat) && cooldownFor(s, p.seat) <= 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  const paired = new Set<number>();
  for (let a = 0; a < ready.length; a++) {
    if (paired.has(ready[a].seat)) continue;
    for (let b = a + 1; b < ready.length; b++) {
      if (paired.has(ready[b].seat) || Math.hypot(ready[a].x - ready[b].x, ready[a].y - ready[b].y) > FUSION_RANGE) continue;
      const first = ready[a], second = ready[b];
      if (startForm(s, { mode: 'coop', seats: [first.seat, second.seat], heroes: [first.hero.id, second.hero.id], scene: s.scene, room: s.room })) {
        paired.add(first.seat); paired.add(second.seat);
      }
      break;
    }
  }
}
export function requestFusion(s: GameState): boolean {
  s.fusion.seat = seatOf(s);
  if (s.fusion.world.forms.some(form => form.remaining > 0 && form.seats.includes(seatOf(s)))) return false;
  if (!fusionStatus(s).ready || !combatScene(s.scene)) return false;
  if (s.coop) { s.fusion.intent = FUSION_INTENT; tryPair(s); return true; }
  const partner = soloPartner(s);
  return !!partner && startForm(s, { mode: 'solo', seats: [0, 0], heroes: [s.active, partner], scene: s.scene, room: s.room });
}
function validForm(s: GameState, form: FusionForm) {
  if (form.scene !== s.scene || form.room !== s.room) return false;
  if (form.mode === 'solo') return !s.coop && s.active === form.heroes[0] && form.heroes.every(id => alive(s.heroes[id]) && s.party.includes(id));
  if (!s.coop) return false;
  const peers = participants(s);
  return form.seats.every((seat, index) => {
    const peer = peers.find(p => p.seat === seat);
    return !!peer && peer.hero.id === form.heroes[index] && peer.scene === form.scene && peer.room === form.room && alive(peer.hero, peer.downed);
  });
}
function endForm(s: GameState, form: FusionForm, cooldown: number = FUSION_COOLDOWN) {
  for (const seat of uniqueSeats(form)) s.fusion.world.cooldowns[seat] = Math.max(s.fusion.world.cooldowns[seat] ?? 0, cooldown);
  if (form.seats.includes(seatOf(s)) || form.seats.includes(s.fusion.seat)) {
    s.fusion.cooldown = Math.max(s.fusion.cooldown, cooldown); s.fusion.intent = 0; s.fusion.specialRequest = 0;
    s.events.push({ type: 'fusion-end', id: form.id });
  }
}
export function tickFusion(s: GameState, dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const elapsed = Math.min(dt, 60);
  s.fusion.seat = seatOf(s); s.fusion.intent = Math.max(0, s.fusion.intent - elapsed); s.fusion.cooldown = Math.max(0, s.fusion.cooldown - elapsed);
  for (const key of Object.keys(s.fusion.world.cooldowns)) {
    const seat = Number(key), next = Math.max(0, s.fusion.world.cooldowns[seat] - elapsed);
    if (next > 0) s.fusion.world.cooldowns[seat] = next; else delete s.fusion.world.cooldowns[seat];
  }
  for (const remote of s.coop?.remoteHeroes ?? []) remote.fusionIntent = Math.max(0, (remote.fusionIntent ?? 0) - elapsed);
  const surviving: FusionForm[] = [];
  for (const form of s.fusion.world.forms) {
    const invalid = s.coop?.role !== 'guest' && !validForm(s, form);
    if (s.coop?.role === 'host' && !form.specialUsed) {
      const lead: RemoteHero | undefined = s.coop.remoteHeroes.find(remote => remote.seat === form.seats[0]);
      if (lead?.fusionSpecial === form.id) form.specialUsed = true;
    }
    const remaining = form.remaining - elapsed;
    if (invalid || remaining <= 0) endForm(s, form, invalid ? FUSION_COOLDOWN : Math.max(0, FUSION_COOLDOWN + remaining));
    else { form.remaining = remaining; surviving.push(form); }
  }
  s.fusion.world.forms = surviving;
  if (!combatScene(s.scene) || !alive(s.heroes[s.active], s.coop?.downed)) s.fusion.intent = 0;
  tryPair(s);
}
export function syncFusionWorld(s: GameState, raw: unknown): boolean {
  const world = cleanFusionWorld(raw);
  if (!world) return false;
  for (const current of s.fusion.world.forms) {
    if (!world.forms.some(form => form.id === current.id)) endForm(s, current, world.cooldowns[seatOf(s)] ?? 0);
  }
  s.fusion.world = world; s.fusion.seat = seatOf(s);
  s.fusion.cooldown = Math.max(s.fusion.cooldown, world.cooldowns[seatOf(s)] ?? 0);
  for (const form of world.forms) {
    applyLocalActivation(s, form);
    if (s.fusion.spentSpecialIds.includes(form.id)) form.specialUsed = true;
  }
  return true;
}
export function consumeFusionSpecial(s: GameState): boolean {
  const form = localFusion(s);
  if (!form || form.specialUsed || s.fusion.spentSpecialIds.includes(form.id) || (form.mode === 'coop' && form.seats[0] !== seatOf(s))) return false;
  const localIndex = form.seats.indexOf(seatOf(s));
  const valid = s.coop?.role === 'guest'
    ? form.scene === s.scene && form.room === s.room && s.active === form.heroes[localIndex] && alive(s.heroes[s.active], s.coop.downed)
    : validForm(s, form);
  if (!valid) return false;
  form.specialUsed = true; remember(s.fusion.spentSpecialIds, form.id);
  if (s.coop?.role === 'guest') s.fusion.specialRequest = form.id;
  s.events.push({ type: 'fusion-special', id: form.id });
  return true;
}
export function resetFusion(s: GameState): void {
  for (const form of s.fusion.world.forms) endForm(s, form);
  s.fusion.world.forms = []; s.fusion.intent = 0; s.fusion.specialRequest = 0;
}
// Activation IDs are scoped to an authority session. A previous solo run or
// room must not prevent a new host's low-numbered activation from spending Ki.
export function beginFusionSession(s: GameState): void {
  resetFusion(s);
  s.fusion.world = createFusionWorld(); s.fusion.seat = seatOf(s);
  s.fusion.appliedIds = []; s.fusion.spentSpecialIds = []; s.fusion.lastAppliedId = 0;
}
