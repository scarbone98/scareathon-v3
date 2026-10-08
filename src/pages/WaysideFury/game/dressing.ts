import type { GameState } from './sim';

// Authored once for collision, both renderers and the host's one-shot gag.
export const AMBIENT_TAXI = { id: 'ambient-roadside-taxi', x: 400, y: 530 };
export const ROADSIDE_SIGN = { id: 'roadside-lore-sign', x: 468, y: 444 };
export const ROADSIDE_VENDING = { id: 'roadside-vending', x: 561, y: 432 };
export const TAXI_ROCK_IMPACT = 1.2;
export const TAXI_GAG_DURATION = 3.5;

export function updateOverworldDressing(s: GameState, dt: number) {
  if (s.scene !== 'overworld' || s.coop?.role === 'guest') return;
  if (s.ambientTaxiGag < 0) {
    if (s.ambientTaxiWrecked) return;
    const drivers = [s, ...(s.coop?.remoteHeroes ?? []).filter(hero => hero.scene === 'overworld')];
    if (!drivers.some(driver => Math.hypot(driver.x - AMBIENT_TAXI.x, driver.y - AMBIENT_TAXI.y) < 126)) return;
    s.ambientTaxiGag = 0;
  }
  const previous = s.ambientTaxiGag;
  s.ambientTaxiGag = Math.min(TAXI_GAG_DURATION, previous + Math.max(0, dt));
  if (!s.ambientTaxiWrecked && previous < TAXI_ROCK_IMPACT && s.ambientTaxiGag >= TAXI_ROCK_IMPACT) {
    // This is scenery: it never creates a damaging projectile or player hit.
    s.ambientTaxiWrecked = true;
    s.personalTaxiWrecked = true;
    s.events.push({ type: 'ambient-taxi-crash', x: AMBIENT_TAXI.x, y: AMBIENT_TAXI.y });
  }
}

export function taxiRockPosition(s: Pick<GameState, 'ambientTaxiGag'>) {
  if (s.ambientTaxiGag < 0 || s.ambientTaxiGag >= TAXI_ROCK_IMPACT) return null;
  const t = s.ambientTaxiGag / TAXI_ROCK_IMPACT;
  return { x: 1092 + (AMBIENT_TAXI.x - 1092) * t, y: 320 + (AMBIENT_TAXI.y - 320) * t,
    height: 38 * (1 - t) + Math.sin(t * Math.PI) * 148, rotation: t * 8 };
}

export function trafficForState(s: Pick<GameState, 'x' | 'y' | 'time' | 'coop'>) {
  return [0, 1].map(index => {
    const direction = index ? 1 : -1, y = index ? 495 : 463;
    let x = 150 + ((s.time * (index ? 24 : -29) + (index ? 600 : 900)) % 980 + 980) % 980;
    for (const driver of [s, ...(s.coop?.remoteHeroes ?? []).filter(hero => hero.scene === 'overworld')]) {
      if (Math.abs(driver.y - y) > 25) continue;
      // Keep a full car's headway if a player is in this lane.
      if (Math.abs(driver.x - x) < 64) x = driver.x - direction * 64;
    }
    // The ambient cab is pulled off the lower lane, leaving the road passable.
    return { x, y, direction, color: index ? '#bd7661' : '#77999c' };
  });
}

export function roadsideBirds(s: Pick<GameState, 'x' | 'y' | 'time' | 'moving'>) {
  return Array.from({ length: 7 }, (_, index) => {
    const homeX = 298 + index * 113, homeY = index % 2 ? 543 : 434;
    const scatter = s.moving ? Math.max(0, 1 - Math.hypot(homeX - s.x, homeY - s.y) / 98) : 0;
    return { x: homeX + scatter * (index % 2 ? 38 : -38), y: homeY - scatter * 54,
      height: scatter * 20, wing: Math.sin(s.time * (scatter ? 20 : 3) + index) * (scatter ? 3 : .5) };
  });
}
