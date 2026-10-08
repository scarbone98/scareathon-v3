import type { GameState } from '../sim.ts';
import { hasFieldFlag } from '../fieldAbilities.ts';
// Both binary anchors share collision/presentation/interaction state. Never a
// party roster or level check: Joe and Matt can always assist once taught.
export const foremanCoreProtected=(s:GameState)=>[0,1].some(n=>!hasFieldFlag(s,`woods-anchor-${n}-powered`));
