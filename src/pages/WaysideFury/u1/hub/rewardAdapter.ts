import type { GameState } from '../../game/sim';
import type { HubQuestSave } from './quests';

export type HubChipGrant = (state: GameState, id: string, source: string) => boolean;
let registeredGrant: HubChipGrant | null = null;

/** U1 installs its grant function when merged. A missing adapter keeps receipts. */
export function registerHubChipGrant(grant: HubChipGrant | null): () => void {
  registeredGrant = grant;
  return () => { if (registeredGrant === grant) registeredGrant = null; };
}

/** Grant adapters return true when a receipt was applied or was already applied. */
export function applyPendingHubChips(state: GameState, save: HubQuestSave, grant: HubChipGrant | null = registeredGrant): HubQuestSave {
  if (!grant || !save.pendingChips.length) return save;
  const pendingChips = save.pendingChips.filter(receipt => {
    try { return !grant(state, receipt.id, receipt.source); }
    catch { return true; }
  });
  return pendingChips.length === save.pendingChips.length ? save : { ...save, pendingChips };
}
