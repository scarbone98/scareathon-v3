import { CHIP_IDS, grantChip, itemsState, type ChipId } from "./chips.ts";
import { registerItemGateAnchors } from "./gating.ts";

import { HERO_OBSTACLES } from "../world/obstacles.ts";
import { registerHubChipGrant } from "../../../u1/hub/rewardAdapter.ts";

const isChipId = (id: unknown): id is ChipId => typeof id === "string" && CHIP_IDS.some(known => known === id);
registerItemGateAnchors(HERO_OBSTACLES);
registerHubChipGrant((state, id, source) =>
  isChipId(id) && (itemsState(state).chips.owned.includes(id) || grantChip(state, id, source)));
