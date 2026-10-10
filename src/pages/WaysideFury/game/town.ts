import { roadClearance } from './roadClearance.ts';
import { terrainSupports, groundSupports } from './propPlacement.ts';
import { TILE, prop, overlaps, tileAt, type CollisionRect, type WorldMap, type WorldProp } from './worldBuilder.ts';

// Wayside town. Houses, yards, mailboxes, fences and street furniture around
// the station and the county road, two cottages on the reservoir loop and two
// along the rain-garden loop. Everything reuses existing county art: the
// house kit (`houseVariants`), mailbox, fence, lamp, bench, bbq and foliage.
//
// Runs after `shapeOrganicAreas`, so the roads already have their final bends
// and every placement is checked against the real ribbon. Solo county only:
// the party county is frozen for older clients.
export const TOWN_HOUSES = [
  // Behind the station, reached down the lane on its west side.
  { id: 'station-cottage', x: 140, y: 200, label: 'Station cottage' },
  // East of the Hollow Woods turn-off, the last house before the blast site.
  { id: 'lane-house', x: 800, y: 318, label: 'Hollow Lane house' },
  // South of the county road, facing the reservoir.
  { id: 'shore-house-west', x: 440, y: 556, label: 'Shore house' },
  { id: 'shore-house-east', x: 600, y: 556, label: 'Shore house' },
  // Lake cottages on the reservoir loop.
  { id: 'lake-cottage-west', x: 480, y: 1094, label: 'Lake cottage' },
  { id: 'lake-cottage-east', x: 880, y: 1094, label: 'Lake cottage' },
  // Garden cottages along the rain-garden loop.
  { id: 'garden-cottage-north', x: 48, y: 930, label: 'Garden cottage' },
  { id: 'garden-cottage-south', x: 48, y: 1060, label: 'Garden cottage' },
] as const;
export const HOUSE_W = 112, HOUSE_H = 72;

const SCENERY = new Set<WorldProp['kind']>(['tree', 'pine', 'bush', 'flower', 'rock', 'reeds', 'puddle', 'debris']);
const rects = (p: WorldProp): CollisionRect[] => [{ x: p.x, y: p.y, w: p.w, h: p.h }, ...(p.footprints ?? [])];

export function dressTown(m: WorldMap) {
  const mask = roadClearance(m);
  const fail = (what: string, r: CollisionRect, why: string) => { throw new Error(`${m.id} town: ${what} at ${r.x},${r.y} ${why}`); };
  // Scatter under a yard or a new prop makes way; authored props never do.
  const clear = (area: CollisionRect, keep?: WorldProp) => { m.props = m.props.filter(p => p === keep || !SCENERY.has(p.kind) || !rects(p).some(r => overlaps(r, area))); };
  const place = (kind: WorldProp['kind'], x: number, y: number, w: number, h: number, label?: string, id?: string) => {
    const p = prop(m, kind, x, y, w, h, label);
    if (id) p.id = id;
    for (const r of rects(p)) {
      if (!terrainSupports(m, r)) fail(kind, r, 'stands in water');
      if (mask.intersects(r, false)) fail(kind, r, 'stands on a road');
      clear(r, p);
      const other = m.props.find(q => q !== p && rects(q).some(b => overlaps(r, b)));
      if (other) fail(kind, r, `overlaps ${other.id}`);
    }
    for (const r of p.footprints ?? []) if (!groundSupports(m, r)) fail(kind, r, 'stands in solid terrain');
    return p;
  };
  // A trodden dirt yard. Only grass turns to dirt; roads, paving, sand and
  // water are left exactly as painted.
  const yard = (x: number, y: number, w: number, h: number) => {
    for (let row = Math.floor(y / TILE); row < Math.ceil((y + h) / TILE); row++) for (let col = Math.floor(x / TILE); col < Math.ceil((x + w) / TILE); col++) {
      if (tileAt(m, col, row) === 'grass' && !m.collision[row * m.cols + col]) m.tiles[row * m.cols + col] = 'dirt';
    }
    clear({ x, y, w, h });
  };
  const house = (spec: typeof TOWN_HOUSES[number]) => place('home', spec.x, spec.y, HOUSE_W, HOUSE_H, spec.label, `town-${spec.id}`);
  const mailbox = (x: number, y: number) => place('mailbox', x, y, 14, 22);
  const fence = (x: number, y: number, w: number) => place('fence', x, y, w, 12);
  const lamp = (x: number, y: number) => place('lamp', x, y, 12, 30);
  const tree = (x: number, y: number) => place('tree', x, y, 24, 32);
  const bush = (x: number, y: number) => place('bush', x, y, 22, 14);
  const flower = (x: number, y: number) => place('flower', x, y, 18, 12);
  const [stationCottage, laneHouse, shoreWest, shoreEast, lakeWest, lakeEast, gardenNorth, gardenSouth] = TOWN_HOUSES.map(house);

  // Station cottage: front yard and a lane down the west side of the station.
  yard(stationCottage.x + 8, stationCottage.y + HOUSE_H, HOUSE_W - 16, 48);
  yard(88, 272, 48, 176);
  mailbox(104, 416);
  tree(258, 222); fence(256, 262, 32); bush(250, 282); flower(262, 300);
  // A bench by the pond, between the station and the diner.
  place('bench', 296, 400, 40, 20, 'Pond bench');

  // Hollow Lane house: yard to the road, mailbox by the lamp.
  yard(laneHouse.x + 12, laneHouse.y + HOUSE_H, HOUSE_W - 24, 58);
  mailbox(784, 414);
  fence(932, 398, 40);
  bush(924, 332); flower(930, 350);

  // Shore houses: fenced front yards facing the reservoir, mailboxes on the road.
  for (const [house, mailboxX] of [[shoreWest, 560], [shoreEast, 720]] as const) {
    yard(house.x + 8, house.y + HOUSE_H, HOUSE_W - 16, 40);
    mailbox(mailboxX, 524);
  }
  fence(392, 622, 40); fence(556, 622, 40); fence(716, 622, 40);
  place('crate', 676, 644, 24, 20);
  flower(456, 636); bush(520, 646); flower(616, 636); tree(764, 560); tree(600, 650);
  bush(776, 596); flower(792, 612);

  // Lake cottages on the reservoir loop.
  for (const [house, mailboxX, mailboxY, fenceX] of [[lakeWest, 600, 1150, 432], [lakeEast, 1000, 1192, 1000]] as const) {
    yard(house.x + 8, house.y + HOUSE_H, HOUSE_W - 16, 32);
    mailbox(mailboxX, mailboxY); fence(fenceX, 1160, 40);
  }
  lamp(640, 1140); lamp(840, 1170);
  tree(620, 1100); bush(700, 1120); flower(730, 1140); tree(1024, 1110); flower(1044, 1150);

  // Garden cottages along the rain-garden loop.
  for (const [house, mailboxX, mailboxY] of [[gardenNorth, 196, 936], [gardenSouth, 176, 1070]] as const) {
    yard(house.x + 8, house.y + HOUSE_H, HOUSE_W - 16, 32);
    mailbox(mailboxX, mailboxY);
  }
  fence(176, 1002, 32); lamp(214, 986);
  bush(170, 980); flower(60, 1040); flower(60, 1150); tree(140, 1150);
}

// The door drawn on a house: at the variant's door fraction (mirrored houses
// flip it), on the facade's bottom edge. Interactable checks reach this point.
export function houseDoor(p: WorldProp, door = .5) {
  const u = p.house?.mirrored ? 1 - door : door;
  return { x: p.x + p.w * u, y: p.y + p.h };
}
