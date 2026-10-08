export interface HubSave { arena: { soloBest: number; coopBest: number; runs: number } }
export function sanitizeHubSave(raw: unknown): HubSave;
export function preserveU1Namespaces(raw: unknown): Record<string, unknown>;
