import type { HubQuestSave } from './u1HubQuests.js';
export interface HubStateSave {
  quests: HubQuestSave; cosmetic: string | null; questSerial: number;
  arena: { soloBest: number; coopBest: number; runs: number };
  radar: { owned: boolean; enabled: boolean };
}
export function sanitizeHubState(raw?: unknown): HubStateSave;
