import type { GameState, GameEvent } from "../../game/sim.ts";
import type { CoopReward } from "../../game/coop";
import { HUB_QUEST_NPCS, QUESTS, acceptQuest, claimQuest, createQuestSave, progressQuests, progressQuestSnapshot, type QuestContext } from "./quests.ts";
import { applyPendingHubChips } from "./rewardAdapter.ts";

export function hubQuestContext(s: GameState): QuestContext {
  return { candy: s.candy, kills: s.kills, bosses: s.bosses, clearedRooms: s.clearedRooms, hiddenFound: s.foundItems };
}
export function tickHubQuests(s: GameState): void {
  const before = s.hubQuests ?? createQuestSave();
  s.hubQuests = applyPendingHubChips(s, progressQuestSnapshot(before, hubQuestContext(s)));
}
export function hubQuestTarget(s: GameState): { id: string; name: string } | null {
  if (s.mapId !== "hub" || s.heroes[s.active].hp <= 0 || s.coop?.downed) return null;
  const npc = [...HUB_QUEST_NPCS].filter(n => Math.hypot(s.x - n.x, s.y - n.y) < 28)
    .sort((a, b) => Math.hypot(s.x - a.x, s.y - a.y) - Math.hypot(s.x - b.x, s.y - b.y))[0];
  return npc ? { id: npc.id, name: `Talk to ${npc.name}` } : null;
}
export function openHubQuest(s: GameState, npcId: string): boolean {
  if (hubQuestTarget(s)?.id !== npcId) return false;
  const quest = QUESTS.find(q => q.npcId === npcId);
  if (!quest) return false;
  tickHubQuests(s); s.hubQuestId = quest.id; s.overlay = "quest"; s.moving = false; s.vx = s.vy = 0;
  return true;
}
export function canUseHubQuest(s: GameState, id: string): boolean {
  const quest = QUESTS.find(q => q.id === id);
  return !!quest && s.mapId === "hub" && s.heroes[s.active].hp > 0 && !s.coop?.downed && Math.hypot(s.x - quest.npc.x, s.y - quest.npc.y) < 32;
}
export function acceptHubQuest(s: GameState, id: string): boolean {
  if (!canUseHubQuest(s, id)) return false;
  tickHubQuests(s);
  const before = s.hubQuests!, next = acceptQuest(before, id, hubQuestContext(s));
  if (next === before) return false;
  s.hubQuests = next; s.events.push({ type: "quest-save", id, kind: "accepted" });
  s.notice = `Quest accepted: ${QUESTS.find(q => q.id === id)?.title}.`;
  return true;
}
export function claimHubQuest(s: GameState, id: string): boolean {
  if (!canUseHubQuest(s, id)) return false;
  tickHubQuests(s);
  const result = claimQuest(s.hubQuests!, id, hubQuestContext(s));
  if (!result.claimed) return false;
  s.candy = Math.min(1_000_000, result.candy); s.hubQuests = applyPendingHubChips(s, result.save);
  s.notice = `Quest complete: ${QUESTS.find(q => q.id === id)?.title}!`;
  s.events.push({ type: "quest-save", id, kind: "claimed" });
  return true;
}
export function selectHubCosmetic(s: GameState, id: string | null): boolean {
  if (id !== null && !s.hubQuests?.cosmetics.includes(id)) return false;
  if (s.hubCosmetic === id) return false;
  s.hubCosmetic = id; s.events.push({ type: "quest-save", id: id ?? "none", kind: "cosmetic" });
  return true;
}
export function trackHubQuestEvent(s: GameState, event: GameEvent): void {
  if (event.type === "pickup") {
    tickHubQuests(s);
    s.hubQuests = progressQuests(s.hubQuests!, { id: `hidden:${event.id}`, type: "hidden-found", targetId: event.id, amount: 1 });
    return;
  }
  if (event.type !== "kill" || s.coop) return;
  s.hubQuests ??= createQuestSave();
  if (!s.hubQuests!.entries.some(entry => entry.status === "active")) return;
  s.hubQuestSerial = Math.min(1_000_000_000, (s.hubQuestSerial ?? 0) + 1);
  const eventId = `quest-kill:${s.hubQuestSerial}`;
  s.hubQuests = progressQuests(s.hubQuests!, { id: eventId, type: "kill" });
  if (event.kind === "boss") s.hubQuests = progressQuests(s.hubQuests!, { id: `boss:${eventId}`, type: "boss-kill", targetId: eventId });
}
export function trackHubCoopReward(s: GameState, reward: CoopReward): void {
  s.hubQuests ??= createQuestSave();
  if (reward.kind === "kill") s.hubQuests = progressQuests(s.hubQuests!, { id: `quest:${reward.id}`, type: "kill" });
  if (reward.kind === "kill" && reward.enemyKind === "boss") s.hubQuests = progressQuests(s.hubQuests!, { id: `quest-boss:${reward.id}`, type: "boss-kill", targetId: reward.id });
}
