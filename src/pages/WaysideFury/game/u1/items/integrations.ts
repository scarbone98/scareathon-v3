import type { GameState } from "../../sim.ts";
import { CHIP_IDS, grantChip, itemsState, type ChipId } from "./chips.ts";
import { registerItemGateAnchors } from "./gating.ts";

interface WorldRegistry { HERO_OBSTACLES: readonly { id: string; rewardAnchor: { x: number; y: number } }[] }
interface HubRewards { registerHubChipGrant: (grant: (state: GameState, id: string, source: string) => boolean) => () => void }
const world = import.meta.glob<WorldRegistry>("../world/obstacles.ts", { eager: true });
const hub = import.meta.glob<HubRewards>("../../../u1/hub/rewardAdapter.ts", { eager: true });
const isChipId = (id: unknown): id is ChipId => typeof id === "string" && CHIP_IDS.some(known => known === id);

for (const registry of Object.values(world)) registerItemGateAnchors(registry.HERO_OBSTACLES);
for (const rewards of Object.values(hub)) rewards.registerHubChipGrant((state, id, source) =>
  isChipId(id) && (itemsState(state).chips.owned.includes(id) || grantChip(state, id, source)));
