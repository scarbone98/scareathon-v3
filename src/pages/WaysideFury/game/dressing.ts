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

export interface TrafficCar {
  x: number; y: number; direction: number; color: string;
  speed: number; velocity: number; updatedAt: number; active: boolean;
}
const ROAD_START = 176, ROAD_END = 1136, HEADWAY = 64;
// Wider than the maximum logical viewport (640), including camera look-ahead.
// Endpoints must be hidden from every driver before a car enters or retires.
const ENDPOINT_CLEARANCE = 680;
const createTraffic = (time: number): TrafficCar[] => [
    { x: ROAD_END, y: 463, direction: -1, color: '#77999c', speed: 29, velocity: 0, updatedAt: time, active: false },
    { x: ROAD_START, y: 495, direction: 1, color: '#bd7661', speed: 24, velocity: 0, updatedAt: time, active: false },
  ];
export function updateTraffic(s: Pick<GameState, 'scene' | 'x' | 'y' | 'time' | 'coop' | 'traffic'>, dt: number) {
  if (s.scene !== 'overworld' || s.coop?.role === 'guest') return;
  const cars = s.traffic ??= createTraffic(s.time);
  const drivers = [s, ...(s.coop?.remoteHeroes ?? []).filter(hero => hero.scene === 'overworld')];
  const hidden = (x: number) => drivers.every(driver => Math.abs(driver.x - x) > ENDPOINT_CLEARANCE);
  for (const car of cars) {
    car.updatedAt = s.time;
    const start = car.direction > 0 ? ROAD_START : ROAD_END;
    const end = car.direction > 0 ? ROAD_END : ROAD_START;
    if (!car.active) {
      if (!hidden(start)) continue;
      car.x = start; car.active = true;
    }
    if (car.x === end && hidden(end)) {
      car.active = false; car.velocity = 0; continue;
    }
    // Clamp forward travel; never teleport a car backward around a driver.
    // A driver cutting into the headway causes a stop until they move away.
    let travel = Math.min(car.speed * Math.max(0, dt), Math.abs(end - car.x));
    for (const driver of drivers) {
      if (Math.abs(driver.y - car.y) > 26) continue;
      const ahead = (driver.x - car.x) * car.direction;
      if (ahead >= -32) travel = Math.min(travel, Math.max(0, ahead - HEADWAY));
    }
    car.x += car.direction * travel;
    car.velocity = dt > 0 ? car.direction * travel / dt : 0;
  }
}
export function syncTraffic(s: Pick<GameState, 'time' | 'traffic'>, current: TrafficCar[] | undefined,
  previous?: TrafficCar[], alpha = 1) {
  s.traffic = current?.map((car, index) => {
    const old = previous?.[index];
    return { ...car, updatedAt: s.time,
      x: old?.active && car.active ? old.x + (car.x - old.x) * alpha : car.x };
  });
}
export function trafficForState(s: Pick<GameState, 'time' | 'traffic'>) {
  // Both renderers use fixed lane slots. Park inactive slots beyond the map so
  // the existing culling hides their meshes without stale ghosts or reindexing.
  return (s.traffic ?? createTraffic(s.time)).map(car => ({ ...car,
    x: car.active ? car.x + car.velocity * Math.max(-1 / 60, Math.min(0, s.time - car.updatedAt))
      : car.direction > 0 ? -1024 : 2304,
  }));
}

export function roadsideBirds(s: Pick<GameState, 'x' | 'y' | 'time' | 'moving'>) {
  return Array.from({ length: 7 }, (_, index) => {
    const homeX = 298 + index * 113, homeY = index % 2 ? 543 : 434;
    const scatter = s.moving ? Math.max(0, 1 - Math.hypot(homeX - s.x, homeY - s.y) / 98) : 0;
    return { x: homeX + scatter * (index % 2 ? 38 : -38), y: homeY - scatter * 54,
      height: scatter * 20, wing: Math.sin(s.time * (scatter ? 20 : 3) + index) * (scatter ? 3 : .5) };
  });
}
