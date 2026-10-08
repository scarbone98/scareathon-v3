import type { HubSave } from './u1Hub.js';
/** Arguments must be snapshots for the same player/account. */
export function mergeHubSaves(primary: unknown, ...others: unknown[]): HubSave;
