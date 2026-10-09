import type { GameState } from './sim.ts';
import { LOCATIONS } from './content.ts';
import { woodsTargets } from './chapters/ch2.ts';
import { cityTargets } from './chapters/ch4.ts';
import type { WorldMap, CollisionRect } from './worldBuilder.ts';
import { overlaps } from './worldBuilder.ts';
export interface MapObjective { id: string; name: string; x: number; y: number }
export function minimapAvailable(s: GameState) {
  return !s.film && !s.dialogue && !s.overlay && !s.insideDiner && !s.transitionTarget && !s.enemies.length &&
    (s.scene === 'overworld' || s.scene === 'hub' || ['woods-layby', 'space-launch', 'city-boulevard', 'city-market', 'city-clockroof', 'city-refuge'].includes(s.mapId));
}
export function resolveMapObjective(s: GameState, map: WorldMap): MapObjective {
  const has = (id: string) => [s.campaignMilestones, s.clearedRooms, s.bosses, s.solvedInteractions, s.coop?.worldCampaignMilestones ?? [], s.coop?.worldClearedRooms ?? [], s.coop?.worldBosses ?? [], s.coop?.worldSolvedInteractions ?? []].some(list => list.includes(id));
  const destination = has('city-complete') ? 'wayside' : has('space-complete') ? 'city' : has('woods-complete') || has('space-dev-entry') ? 'space' : has('realm-0') ? 'forest' : 'blast';
  const location = LOCATIONS.find(l => l.id === destination)!;
  if (s.scene === 'overworld') return { ...location, name: has('city-complete') ? 'Return to Wayside · final rift awaiting' : location.name };
  if (s.scene === 'hub' && has('city-complete')) return { id: 'station', name: 'Rally with Alex at Wayside Station', x: 480, y: 192 };
  if (s.scene === 'hub') return { id: 'taxi', name: `Take the taxi to ${location.name}`, x: 480, y: 440 };
  if (s.mapId === 'space-launch' && !has('space-complete')) {
    if (!has('space-fuel')) return { id: 'space-fuel', name: 'Power the safe fuel panel', x: 380, y: 308 };
    if (!s.spaceOutfit) return { id: 'space-lockers', name: 'Seal all five suits', x: 162, y: 184 };
    return { id: 'space-board', name: 'Board the rocket', x: 256, y: 192 };
  }
  if (s.mapId === 'woods-layby' && !has('breaker-knuckle')) return woodsTargets(s).find(t => t.id === 'woods-ghost')!;
  const city = cityTargets(s).find(t => !has(t.id) && (t.id.startsWith('city-anchor-') || ['city-evacuate', 'city-next-chapter'].includes(t.id)));
  if (s.mapId.startsWith('city-') && city && !has('city-complete')) return city;
  const complete = s.mapId.startsWith('woods-') && has('woods-complete') || s.mapId.startsWith('city-') && has('city-complete');
  const homeward = map.exits.find(e => ['hub', 'overworld'].includes(String(e.target))) ?? map.exits.find(e => typeof e.target === 'number' && e.target < s.room);
  const forward = (complete ? homeward : map.exits.find(e => typeof e.target === 'number' && e.target > s.room && !has(e.targetMapId ?? ''))) ?? map.exits[0];
  if (forward) return { id: forward.id, name: forward.name, x: forward.x + forward.w / 2, y: forward.y + forward.h / 2 };
  return { id: 'return', name: `Continue to ${location.name}`, ...map.spawn };
}
// Shared with browser assertions; measured HUD, safe-area and touch bounds are inputs.
export function minimapLayout(width: number, height: number, obstacles: CollisionRect[], inset = 12): CollisionRect {
  const size = Math.round(Math.min(width, height) * .24);
  for (let y = inset; y + size <= height - inset; y += 4) {
    for (const x of [width - inset - size, inset]) {
      const box = { x, y, w: size, h: size };
      if (!obstacles.some(o => overlaps(box, { x: o.x - 8, y: o.y - 8, w: o.w + 16, h: o.h + 16 }))) return box;
    }
  }
  return { x: width - inset - size, y: inset, w: size, h: size };
}
