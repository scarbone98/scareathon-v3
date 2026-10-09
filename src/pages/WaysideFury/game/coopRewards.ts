import { trackHubCoopReward } from "../u1/hub/hubRules.ts";
import { chipEffects } from "./u1/items/chips.ts";
import { grantCheckpointChip } from "./u1/items/pickups.ts";
import { combatXp, gainXp, grantGear, syncCoopLevel, type GameState } from "./sim.ts";
import { MAX_COOP_REWARDS } from "../../../../server/shared/waysideFury/save.js";
import type { CoopReward } from "./coop";
import { grantPickup } from "./collectibles.ts";

// Roll separately for each authenticated seat. The stable event ID means a
// retransmitted reward always describes the same personal loot.
export function rollCoopCandy(id: string, userId: string, boss: boolean) {
  let hash = 2166136261;
  for (const char of `${id}:${userId}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (boss ? 35 : 2) + (hash >>> 0) % (boss ? 8 : 3);
}
export function applyCoopReward(s: GameState, reward: CoopReward): boolean {
  const receipts = s.coopRewards ??= [];
  if (receipts.includes(reward.id)) return false;
  receipts.push(reward.id);
  if (receipts.length > MAX_COOP_REWARDS) receipts.splice(0, receipts.length - MAX_COOP_REWARDS);
  if (reward.kind === "pickup") return reward.pickupId ? grantPickup(s, reward.pickupId) : false;
  const repeatedArea = s.coop?.role !== "host" && reward.areas?.some(id => id !== "wayside" && s.areas.includes(id));
  const xp = reward.kind === "kill" && (reward.xp ?? 0) > 0 ? combatXp(s, reward.xp!, reward.xpLevel) : reward.xp ?? 0;
  gainXp(s, xp + (repeatedArea ? 75 : 0));
  const candy = reward.kind === "kill" ? Math.floor((reward.candy ?? 0) * chipEffects(s).candyMultiplier) + chipEffects(s).candyBonusPerKill : reward.candy ?? 0;
  s.candy = Math.min(1_000_000, s.candy + candy);
  if (reward.power || reward.ward) grantGear(s, reward.power ?? 0, reward.ward ?? 0);
  for (const hero of Object.values(s.heroes)) {
    if (hero.hp > 0) hero.hp = Math.min(hero.maxHp, hero.hp + (reward.healHp ?? 0));
    hero.ki = Math.min(hero.maxKi, hero.ki + (reward.healKi ?? 0));
  }
  if (reward.kind === "kill") s.kills++;
  s.areas = [...new Set([...s.areas, ...(reward.areas ?? [])])];
  s.bosses = [...new Set([...s.bosses, ...(reward.bosses ?? [])])];
  s.clearedRooms = [...new Set([...s.clearedRooms, ...(reward.rooms ?? [])])];
  s.campaignMilestones = [...new Set([...s.campaignMilestones, ...(reward.campaignMilestones ?? [])])];
  s.solvedInteractions = [...new Set([...s.solvedInteractions,...(reward.solvedInteractions ?? [])])];
  s.completedCinematics = [...new Set([...s.completedCinematics,...(reward.completedCinematics ?? [])])];
  s.chapter = Math.max(s.chapter, reward.chapter ?? s.chapter);
  trackHubCoopReward(s, reward);
  for (const id of [...(reward.bosses ?? []), ...(reward.rooms ?? [])]) grantCheckpointChip(s, id);
  syncCoopLevel(s);
  s.notice = reward.kind === "kill" ? `+${xp} XP · +${candy} candy` : repeatedArea ? "Area already cleared · +75 bonus XP" : "Party checkpoint saved to your character.";
  return true;
}
