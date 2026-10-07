export const SAVE_VERSION: 1;
export const VENTURE_COUNT: number;
export const MAX_SAVE_BYTES: number;

export type SavedVenture = { owned: number; progress: number; running: boolean; managed: boolean };
export type Save = {
  v: 1;
  cash: number;
  runEarned: number;
  lifetime: number;
  investors: number;
  investorsClaimed: number;
  ventures: SavedVenture[];
  upgrades: string[];
  seances: string[];
  savedAt: number;
  runStartedAt: number;
  resets: number;
};

export function sanitizeSave(raw: unknown, now?: number): { save: Save; error?: undefined } | { save?: undefined; error: string };
