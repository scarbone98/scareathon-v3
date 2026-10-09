// Quest receipts live on the local player's save.u1.hub.quests. These pure rules
// never mutate the co-op world, buy shop items, or award Arcade tickets.
import { HUB_QUEST_RULES, sanitizeHubQuests } from '../../../../../server/shared/waysideFury/u1HubQuests.js';
export interface QuestNpc { id: string; name: string; role: string; x: number; y: number; hero?: 'alex' | 'jon' }
export type QuestObjective =
  | { type: 'fetch'; currency: 'candy' | string; amount: number; label: string }
  | { type: 'hunt' | 'boss' | 'clear' | 'discover'; amount: number; label: string };
export interface QuestRewards { candy: number; chip?: string; cosmetic?: string; cosmeticName?: string }
export interface QuestDefinition {
  id: string; title: string; npcId: string; npc: QuestNpc; description: string;
  dialogue: readonly string[]; reminder: string; thanks: string; objective: QuestObjective; rewards: QuestRewards;
}
export interface QuestContext {
  candy: number; kills: number; bosses: readonly string[]; clearedRooms: readonly string[];
  inventory?: Readonly<Record<string, number>>; hiddenFound?: readonly string[];
}
export interface QuestBaseline { kills: number; bosses: string[]; rooms: string[]; hidden: string[] }
export interface QuestEntry { id: string; status: 'active' | 'claimed'; progress: number; eventProgress: number; baseline: QuestBaseline }
export interface QuestChipGrant { id: string; source: string }
export interface HubQuestSave { entries: QuestEntry[]; cosmetics: string[]; pendingChips: QuestChipGrant[]; seenEvents: string[] }
export interface QuestProgressEvent { id: string; type: 'kill' | 'boss-kill' | 'room-clear' | 'hidden-found'; targetId?: string; amount?: number }
export interface QuestClaim { save: HubQuestSave; candy: number; inventory: Record<string, number>; rewards: QuestRewards | null; claimed: boolean }
export type QuestStatus = 'available' | 'active' | 'ready' | 'claimed';

export const HUB_QUEST_NPCS: readonly QuestNpc[] = [
  { id: 'u8-quest-alex', name: 'Alex', role: 'Station defender', x: 344, y: 248, hero: 'alex' },
  { id: 'u8-quest-jon', name: 'Jon', role: 'Trail keeper', x: 824, y: 408, hero: 'jon' },
  { id: 'u8-quest-bea', name: 'Bea', role: 'BBQ pitmaster', x: 624, y: 432 },
  { id: 'u8-quest-marnie', name: 'Marnie', role: 'Festival stylist', x: 280, y: 248 },
  { id: 'u8-quest-tessa', name: 'Tessa', role: 'Station steward', x: 560, y: 240 },
  { id: 'u8-quest-ravi', name: 'Ravi', role: 'Supply runner', x: 304, y: 392 },
  { id: 'u8-quest-nia', name: 'Nia', role: 'Night watch', x: 880, y: 384 },
];
const [alex, jon, bea, marnie, tessa, ravi, nia] = HUB_QUEST_NPCS;
export const QUESTS: readonly QuestDefinition[] = [
  { id: 'alex-patrol', title: 'Keep the road clear', npcId: alex.id, npc: alex,
    description: 'Defeat 8 monsters after accepting. Monsters in the tournament also count.',
    dialogue: ['The station is holding, but the monsters keep pressing toward town.', 'Take down eight monsters. I have a Scanner chip that will help you read the next fight.'],
    reminder: 'Eight monsters, anywhere the crew fights. Every safe journey starts with a clear road.', thanks: 'That is a little breathing room for Wayside. You earned this Scanner.',
    objective: { type: 'hunt', amount: HUB_QUEST_RULES['alex-patrol'].amount, label: 'Monsters defeated' }, rewards: HUB_QUEST_RULES['alex-patrol'].rewards },
  { id: 'jon-trails', title: 'Open the side trails', npcId: jon.id, npc: jon,
    description: 'Clear 3 new combat zones after accepting. Supply caches do not count.',
    dialogue: ['People are stranded out past the impact site. We need more than one safe route.', 'Clear three new zones. I saved an Iron Guard chip for whoever opens those trails.'],
    reminder: 'Clear three zones you have not cleared yet. The orchard and old depot are worth a look.', thanks: 'The scouts can get through now. Take the Iron Guard and stay safe out there.',
    objective: { type: 'clear', amount: HUB_QUEST_RULES['jon-trails'].amount, label: 'New zones cleared' }, rewards: HUB_QUEST_RULES['jon-trails'].rewards },
  { id: 'joe-bbq', title: 'Save the BBQ', npcId: bea.id, npc: bea,
    description: 'Deliver 18 candy to Bea for the crew dinner. The candy is consumed once.',
    dialogue: ['Joe charged the grill again. The sauce bottles are the only things that survived.', 'Bring eighteen candy and I can replace dinner. I will stitch you a BBQ apron as a thank-you.'],
    reminder: 'Eighteen candy buys the ingredients. Bring it back here when you have enough.', thanks: 'Dinner is saved! This apron is for the hero who kept the crew fed.',
    objective: { type: 'fetch', currency: 'candy', amount: HUB_QUEST_RULES['joe-bbq'].amount, label: 'Candy for dinner' }, rewards: HUB_QUEST_RULES['joe-bbq'].rewards },
  { id: 'marnie-display', title: 'Festival colors', npcId: marnie.id, npc: marnie,
    description: 'Deliver 24 candy to Marnie for festival supplies. The candy is consumed once.',
    dialogue: ['The sky can turn strange, but the festival lights are still going up.', 'Twenty-four candy covers my supplies. Help me finish and this station scarf is yours.'],
    reminder: 'Bring twenty-four candy for the festival display. A little color goes a long way.', thanks: 'The display looks like Wayside again. Wear this scarf however you like.',
    objective: { type: 'fetch', currency: 'candy', amount: HUB_QUEST_RULES['marnie-display'].amount, label: 'Candy for supplies' }, rewards: HUB_QUEST_RULES['marnie-display'].rewards },
  { id: 'tessa-patrol', title: 'Last train home', npcId: tessa.id, npc: tessa,
    description: 'Defeat 12 monsters after accepting to help the station escorts.',
    dialogue: ['The last train is full of families. Our escorts are stretched thin.', 'Beat twelve monsters and I can free up a crew. This Sprinter chip will make the next escort faster.'],
    reminder: 'Twelve monsters after we spoke. Tournament fights count toward keeping your skills sharp.', thanks: 'Everyone is aboard. Here is your Sprinter chip and a little travel candy.',
    objective: { type: 'hunt', amount: HUB_QUEST_RULES['tessa-patrol'].amount, label: 'Monsters defeated' }, rewards: HUB_QUEST_RULES['tessa-patrol'].rewards },
  { id: 'ravi-supplies', title: 'A runner’s care package', npcId: ravi.id, npc: ravi,
    description: 'Deliver 32 candy to Ravi for emergency parcels. The candy is consumed once.',
    dialogue: ['My supply parcels got scattered. I have boots, blankets, and no snacks.', 'Thirty-two candy fills the care packages. I found a Candy Magnet chip on my last run; you can have it.'],
    reminder: 'Thirty-two candy, and every parcel gets something sweet. I will trade you the Candy Magnet.', thanks: 'The parcels are packed. This chip belongs with someone who actually gets into the action.',
    objective: { type: 'fetch', currency: 'candy', amount: HUB_QUEST_RULES['ravi-supplies'].amount, label: 'Candy for care packages' }, rewards: HUB_QUEST_RULES['ravi-supplies'].rewards },
  { id: 'nia-watch', title: 'Quiet the big one', npcId: nia.id, npc: nia,
    description: 'Defeat a boss after accepting. Tournament bosses also count.',
    dialogue: ['The small ones are restless whenever a guardian starts moving.', 'Bring down one boss. I will pass along a Ki Coil chip from the watch locker.'],
    reminder: 'One boss after we spoke. The tournament brings in tough opponents if the trails are already clear.', thanks: 'Even the night feels quieter. The Ki Coil is yours; keep that ki ready.',
    objective: { type: 'boss', amount: HUB_QUEST_RULES['nia-watch'].amount, label: 'Bosses defeated' }, rewards: HUB_QUEST_RULES['nia-watch'].rewards },
];

const count = (raw: unknown, max = 1_000_000) => typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.min(max, Math.floor(raw))) : 0;
const validId = (raw: unknown): raw is string => typeof raw === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(raw);
const ids = (raw: unknown, limit = 128) => [...new Set((Array.isArray(raw) ? raw : []).filter(validId))].slice(0, limit);
const isZone = (id: string) => /^(blast|realm)-[0-9]+$/.test(id) || /^(woods|city|moon)-/.test(id);
const fetchCount = (q: QuestDefinition, context: QuestContext) => q.objective.type === 'fetch' ? count(q.objective.currency === 'candy' ? context.candy : context.inventory?.[q.objective.currency], q.objective.amount) : 0;

/** Migrate missing old-save data and bound untrusted local/cloud JSON. */
export function createQuestSave(raw?: unknown): HubQuestSave {
  return sanitizeHubQuests(raw);
}

export function acceptQuest(save: HubQuestSave, id: string, context: QuestContext): HubQuestSave {
  if (!QUESTS.some(q => q.id === id) || save.entries.some(e => e.id === id)) return save;
  const quest = QUESTS.find(q => q.id === id)!;
  return { ...save, entries: [...save.entries, { id, status: 'active', progress: fetchCount(quest, context), eventProgress: 0,
    baseline: { kills: count(context.kills), bosses: ids(context.bosses), rooms: ids(context.clearedRooms).filter(isZone), hidden: ids(context.hiddenFound) } }] };
}

/** Events must be local-player rewards, with stable IDs across co-op replays. */
export function progressQuests(save: HubQuestSave, event: QuestProgressEvent): HubQuestSave {
  if (!validId(event.id) || save.seenEvents.includes(event.id)) return save;
  const target = event.targetId, targetReceipt = target && event.type !== 'kill' ? `${event.type}:${target}` : null;
  if (targetReceipt && save.seenEvents.includes(targetReceipt)) return save;
  const entries = save.entries.map(entry => {
    if (entry.status !== 'active') return entry;
    const quest = QUESTS.find(q => q.id === entry.id);
    if (!quest) return entry;
    const matches = (quest.objective.type === 'hunt' && event.type === 'kill') ||
      (quest.objective.type === 'boss' && event.type === 'boss-kill' && (!target || !entry.baseline.bosses.includes(target))) ||
      (quest.objective.type === 'clear' && event.type === 'room-clear' && !!target && isZone(target) && !entry.baseline.rooms.includes(target)) ||
      (quest.objective.type === 'discover' && event.type === 'hidden-found' && !!target && !entry.baseline.hidden.includes(target));
    if (!matches) return entry;
    const eventProgress = Math.min(quest.objective.amount, entry.eventProgress + count(event.amount ?? 1, quest.objective.amount));
    return { ...entry, eventProgress, progress: Math.max(entry.progress, eventProgress) };
  });
  return { ...save, entries, seenEvents: [...save.seenEvents, event.id, ...(targetReceipt && validId(targetReceipt) ? [targetReceipt] : [])].slice(-256) };
}

/** Snapshot progress and event progress describe the same actions; take their maximum. */
export function progressQuestSnapshot(save: HubQuestSave, context: QuestContext): HubQuestSave {
  let changed = false;
  const entries = save.entries.map(entry => {
    if (entry.status !== 'active') return entry;
    const quest = QUESTS.find(q => q.id === entry.id);
    if (!quest) return entry;
    const objective = quest.objective;
    let observed = 0;
    if (objective.type === 'fetch') observed = fetchCount(quest, context);
    else if (objective.type === 'hunt') observed = Math.max(0, count(context.kills) - entry.baseline.kills);
    else if (objective.type === 'boss') observed = ids(context.bosses).filter(id => !entry.baseline.bosses.includes(id)).length;
    else if (objective.type === 'clear') observed = ids(context.clearedRooms).filter(id => isZone(id) && !entry.baseline.rooms.includes(id)).length;
    else observed = ids(context.hiddenFound).filter(id => !entry.baseline.hidden.includes(id)).length;
    const progress = Math.min(objective.amount, objective.type === 'fetch' ? observed : Math.max(entry.progress, entry.eventProgress, observed));
    if (progress === entry.progress) return entry;
    changed = true; return { ...entry, progress };
  });
  return changed ? { ...save, entries } : save;
}

export function questProgress(save: HubQuestSave, quest: QuestDefinition, context: QuestContext): number {
  const entry = save.entries.find(e => e.id === quest.id);
  if (!entry) return 0;
  return entry.status === 'claimed' ? quest.objective.amount : quest.objective.type === 'fetch' ? fetchCount(quest, context) : entry.progress;
}
export function questStatus(save: HubQuestSave, id: string, context: QuestContext): QuestStatus {
  const quest = QUESTS.find(q => q.id === id), entry = save.entries.find(e => e.id === id);
  if (!quest || !entry) return 'available';
  if (entry.status === 'claimed') return 'claimed';
  return questProgress(save, quest, context) >= quest.objective.amount ? 'ready' : 'active';
}

/** Claim consumes fetch inventory and commits the receipt before returning rewards. */
export function claimQuest(save: HubQuestSave, id: string, context: QuestContext): QuestClaim {
  const inventory = Object.fromEntries(Object.entries(context.inventory ?? {}).filter(([key]) => validId(key)).map(([key, value]) => [key, count(value)]));
  const candy = count(context.candy, 100_000_000), quest = QUESTS.find(q => q.id === id);
  const noReward: QuestClaim = { save, candy, inventory, rewards: null, claimed: false };
  if (!quest || questStatus(save, id, context) !== 'ready') return noReward;
  const objective = quest.objective;
  let remainingCandy = candy;
  if (objective.type === 'fetch') {
    if (objective.currency === 'candy') remainingCandy -= objective.amount;
    else inventory[objective.currency] = count(inventory[objective.currency]) - objective.amount;
  }
  const grant = quest.rewards.chip ? [{ id: quest.rewards.chip, source: `u8:${id}` }] : [];
  return { claimed: true, candy: Math.min(100_000_000, remainingCandy + quest.rewards.candy), inventory, rewards: quest.rewards,
    save: { ...save, entries: save.entries.map(e => e.id === id ? { ...e, status: 'claimed', progress: quest.objective.amount } : e),
      cosmetics: [...new Set([...save.cosmetics, ...(quest.rewards.cosmetic ? [quest.rewards.cosmetic] : [])])],
      pendingChips: [...save.pendingChips.filter(g => g.source !== `u8:${id}`), ...grant] } };
}

/** Call after U1 grantChip(state, id, source) succeeds. Stable sources make retries harmless. */
export function acknowledgeQuestChip(save: HubQuestSave, source: string): HubQuestSave {
  if (!save.pendingChips.some(grant => grant.source === source)) return save;
  return { ...save, pendingChips: save.pendingChips.filter(grant => grant.source !== source) };
}

export function questRewardsSummary(quest: QuestDefinition): string {
  return [quest.rewards.candy ? `${quest.rewards.candy} candy` : '', quest.rewards.chip ? `${quest.rewards.chip.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join(' ')} chip` : '', quest.rewards.cosmeticName ?? ''].filter(Boolean).join(' + ');
}
