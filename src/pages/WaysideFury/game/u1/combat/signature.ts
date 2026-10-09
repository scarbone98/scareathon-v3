import type { GameState, HeroId } from "../../sim.ts";
import type { TrainingTier } from "../../../../../../server/shared/waysideFury/u1Combat.js";

export interface SignatureDefinition {
  name: string; angles: number[]; damage: number; radius: number; size: number;
  speed: number; ttl: number; kiRefund: number; staminaRestore: number; tier: TrainingTier;
}
const BASE: Record<HeroId, { name: string; angles: number[]; damage: number; radius: number; size: number }> = {
  you: { name: "YOU: Fury Wave!", angles: [0], damage: 4.4, radius: 10, size: 130 },
  joe: { name: "JOE: Wayside Wave!", angles: [0], damage: 4.4, radius: 10, size: 130 },
  matt: { name: "MATT: Golden Fury!", angles: [-0.16, 0, 0.16], damage: 1.8, radius: 6, size: 105 },
  alex: { name: "ALEX: Twin Comet!", angles: [-0.1, 0.1], damage: 2.4, radius: 7, size: 115 },
  jon: { name: "JON: Night Breaker!", angles: [0], damage: 4.8, radius: 12, size: 140 },
};
const MASTER_ANGLES: Record<HeroId, number[]> = {
  you: [-0.08, 0, 0.08], joe: [-0.12, 0, 0.12], matt: [-0.28, -0.14, 0, 0.14, 0.28],
  alex: [-0.18, 0, 0.18], jon: [-0.1, 0, 0.1],
};

export function signatureDefinition(s: GameState, heroId: HeroId = s.active): SignatureDefinition {
  const tier = s.u1.combat.training[heroId], base = BASE[heroId];
  const angles = tier >= 2 ? MASTER_ANGLES[heroId] : base.angles;
  // Wider volleys share their energy instead of tripling a wave's damage.
  const energyPerBeam = base.angles.length / angles.length;
  return {
    ...base, angles: [...angles], tier,
    name: tier ? `${base.name} · Tier ${tier}` : base.name,
    damage: base.damage * (1 + tier * 0.14) * energyPerBeam,
    radius: base.radius + (tier >= 2 ? 1 : 0), size: base.size + tier * 10,
    speed: tier >= 1 ? 285 : 245,
    ttl: tier >= 3 ? 1.05 : 0.8,
    kiRefund: tier >= 3 ? s.heroes[heroId].maxKi * 0.15 : 0,
    staminaRestore: tier >= 3 ? 20 : 0,
  };
}
