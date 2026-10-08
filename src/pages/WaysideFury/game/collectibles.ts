import { sameCampaignMap } from "./campaign.ts";
import { HIDDEN_PICKUPS, type HiddenPickup } from "../../../../server/shared/waysideFury/collectibles.js";
import type { GameEvent } from "./sim.ts";
export { HIDDEN_PICKUPS };
export type { HiddenPickup };
interface PickupWorld {
  scene: string; room: number; mapId?: string; chapter: number; foundItems: string[]; ambientTaxiWrecked: boolean;
  insideDiner?: boolean;
  coop?: { role: "host" | "guest"; downed?: boolean; worldChapter?: number };
}
interface PickupState extends PickupWorld {
  x: number; y: number; time: number; candy: number; active: string; notice: string;
  heroes: Record<string, { hp: number; maxHp: number; ki: number; maxKi: number }>;
  events: GameEvent[];
  pickupPending?: { id: string; at: number };
}
export function availablePickups(s: PickupWorld): HiddenPickup[] {
  const chapter = s.coop?.worldChapter ?? s.chapter;
  const items: readonly HiddenPickup[] = s.mapId === "interior-diner" ? HIDDEN_PICKUPS.filter(item=>item.requiresDiner).map(item=>({...item, scene:"dungeon", room:101, mapId:"interior-diner", x:216, y:152})) : HIDDEN_PICKUPS;
  return items.filter(item => sameCampaignMap(s, item) && item.chapter <= chapter &&
    (!item.requiresWreck || s.ambientTaxiWrecked) && (!item.requiresDiner || s.insideDiner) && !s.foundItems.includes(item.id));
}
export function pickupInReach(s: PickupWorld & { x: number; y: number }, id: string, radius = 28): HiddenPickup | undefined {
  return availablePickups(s).find(item => item.id === id && Math.hypot(s.x - item.x, s.y - item.y) <= radius);
}
export function authoritativePickupTarget(world: PickupWorld, peer: { scene: string; room: number; mapId?: string; x: number; y: number; hero: { hp: number }; downed?: boolean }, id: string) {
  if (!sameCampaignMap(world, peer) || peer.hero.hp <= 0 || peer.downed) return undefined;
  // The host's personal finds do not remove another player's instance. A diner
  // request still has to come from its fixed doorway on the host's map.
  return pickupInReach({ ...world, x: peer.x, y: peer.y, foundItems: [], insideDiner: true }, id);
}
// Host-approved rewards can arrive after travel; the durable personal ID still
// rejects every replay without tying a character's finds to the party's world.
export function grantPickup(s: PickupState, id: string): boolean {
  const item = HIDDEN_PICKUPS.find(pickup => pickup.id === id);
  if (!item || s.foundItems.includes(id)) return false;
  s.foundItems.push(id); delete s.pickupPending;
  const hero = s.heroes[s.active];
  if (hero.hp > 0) hero.hp = Math.min(hero.maxHp, hero.hp + (item.healHp ?? 0));
  hero.ki = Math.min(hero.maxKi, hero.ki + (item.healKi ?? 0));
  s.candy = Math.min(1_000_000, s.candy + (item.candy ?? 0));
  s.notice = `Found ${item.name}${item.kind === "lore" ? " · Read it in Collection" : item.kind === "trinket" ? " · Passive equipped" : ""}`;
  s.events.push({ type: "pickup", id }, { type: "checkpoint", id: `personal-${id}` });
  return true;
}
export function collectPickup(s: PickupState, id: string): boolean {
  if (s.coop?.downed || s.heroes[s.active].hp <= 0 || !pickupInReach(s, id)) return false;
  if (s.coop?.role === "guest") {
    if (s.pickupPending?.id === id && s.time - s.pickupPending.at < 1) return false;
    s.pickupPending = { id, at: s.time }; s.events.push({ type: "coop-pickup", id });
    return true;
  }
  return grantPickup(s, id);
}
export function walkingPickup(s: PickupState): boolean {
  const item = availablePickups(s).find(pickup => pickup.walkover && Math.hypot(s.x - pickup.x, s.y - pickup.y) <= 10);
  return item ? collectPickup(s, item.id) : false;
}
export function pickupBuffs(s: Pick<PickupWorld, "foundItems">) {
  const found = HIDDEN_PICKUPS.filter(item => s.foundItems.includes(item.id));
  return { speed: found.some(item => item.buff === "speed") ? 1.05 : 1, charge: found.some(item => item.buff === "charge") ? 1.1 : 1 };
}
