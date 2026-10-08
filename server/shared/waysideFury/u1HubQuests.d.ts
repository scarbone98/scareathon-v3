export interface HubQuestBaseline { kills: number; bosses: string[]; rooms: string[]; hidden: string[] }
export interface HubQuestEntry { id: string; status: 'active' | 'claimed'; progress: number; eventProgress: number; baseline: HubQuestBaseline }
export interface HubQuestChipGrant { id: string; source: string }
export interface HubQuestSave { entries: HubQuestEntry[]; cosmetics: string[]; pendingChips: HubQuestChipGrant[]; seenEvents: string[] }
export interface HubQuestRewards { candy: number; chip?: string; cosmetic?: string; cosmeticName?: string }
export const HUB_QUEST_RULES: Readonly<Record<string, { readonly kind: 'hunt' | 'clear' | 'fetch' | 'boss'; readonly amount: number; readonly rewards: Readonly<HubQuestRewards> }>>;
export function sanitizeHubQuests(raw?: unknown): HubQuestSave;
