import type { HubQuestSave } from "./u1HubQuests.js";
export interface HubSave { arena: { soloBest: number; coopBest: number; runs: number }; quests: HubQuestSave; cosmetic: string | null; eventSerial: number }
export function sanitizeHubSave(raw: unknown): HubSave;
export function preserveU1Namespaces(raw: unknown): Record<string, unknown>;
