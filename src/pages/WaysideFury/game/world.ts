import { CITY_WORLDS } from "./chapters/ch4Worlds.ts";
import { WOODS_WORLDS } from "./chapters/ch2Worlds.ts";
import { dressCounty } from "./county.ts";
import { compound, LAUNCH_WORLD, MOON_WORLDS } from "./chapters/ch3Worlds.ts";
import { TILE, tileAt, map, paint, prop, parkedCar, boundary, exit, road, scatter, encounter, type WorldMap } from "./worldBuilder.ts";
export * from "./worldBuilder.ts";

const makeOverworld = (expanded: boolean) => {
  const m = map("overworld", "Wayside County", expanded ? 144 : 120, expanded ? 96 : 60, "grass");
  boundary(m, "grass");
  paint(m, 224, 192, 224, 208, "sand"); paint(m, 240, 208, 192, 176, "water", true);
  paint(m, 864, 80, 272, 144, "sand"); paint(m, 880, 96, 240, 112, "water", true);
  paint(m, 1008, 256, 176, 160, "ash"); paint(m, 1024, 272, 144, 112, "corrupt");
  paint(m, 576, 80, 160, 160, "corrupt"); paint(m, 944, 544, 176, 96, "corrupt");
  // Paint the roads after regional terrain so corruption cannot cut a branch off.
  road(m, { id: 'county', x: 32, y: 448, w: expanded ? 2240 : 1856, h: 64, direction: 'horizontal', start: 'barrier', end: 'barrier' });
  road(m, { id: 'station', x: 176, y: 432, w: 64, h: 80, direction: 'vertical', start: 'entrance', end: 'junction' });
  road(m, { id: 'forest', x: 624, y: 240, w: 64, h: 272, direction: 'vertical', start: 'entrance', end: 'junction' });
  road(m, { id: 'blast', x: 1056, y: 416, w: 64, h: 96, direction: 'vertical', start: 'entrance', end: 'junction' });
  road(m, { id: 'city', x: 1008, y: 448, w: 64, h: 96, direction: 'vertical', start: 'junction', end: 'entrance' });
  paint(m, 624, 176, 64, 64, 'stone'); // Forest gate approach.
  paint(m, 1056, 384, 64, 32, 'stone'); // Blast Site entrance apron.
  paint(m, 1008, 544, 64, 48, 'stone'); // City gate approach.
  paint(m, 368, 512, 64, 32, 'stone'); // Cab pullout, clear of the fence.
  paint(m, 576, 416, 48, 32, 'stone');
  paint(m, 864, 512, 48, 48, 'stone');
  prop(m, "station", 136, 320, 160, 112, "Wayside Station");
  prop(m, "crater", 1024, 272, 160, 96);
  // Overworld portals are rendered at their location markers, at these base positions.
  prop(m, "portal", 632, 120, 48, 56); prop(m, "portal", 1008, 504, 48, 56);
  for (let x = 336; x < 1040; x += 144) {
    prop(m, "lamp", x, 422, 12, 30);
    if (x === 336) {
      // Two short runs frame the cab's pullout instead of crossing its body.
      prop(m, "fence", 328, 526, 32, 12); prop(m, "fence", 448, 526, 32, 12);
    } else prop(m, "fence", x + 32, 526, 64, 12);
  }
  // A separate pullout keeps this NPC cab off the player's starting position
  // and leaves both traffic lanes open after the crash.
  const cab = prop(m, "ambient-taxi", 384, 512, 32, 18); cab.id = "ambient-roadside-taxi";
  const lore = prop(m, "sign", 456, 420, 24, 24, "Old County Road"); lore.id = "roadside-lore-sign";
  const machine = prop(m, "vending", 550, 398, 22, 34, "Candy machine"); machine.id = "roadside-vending";
  prop(m, "diner", 464, 330, 112, 64, "Last Light Diner");
  paint(m, 500, 394, 40, 54, "dirt");
  parkedCar(m, 584, 418, 36, 22); parkedCar(m, 866, 514, 36, 22);
  prop(m, "rock", 292, 526, 24, 16);
  prop(m, "tree", 748, 274, 24, 32);
  prop(m, "sign", 1000, 414, 24, 24, "Blast Site · East");
  for (const [x, y] of [[314, 528], [716, 412], [926, 527]]) prop(m, "mailbox", x, y, 14, 22);
  for (let n = 0; n < 22; n++) {
    const x = 282 + n * 39, y = n % 2 ? 556 + n % 3 * 11 : 393 - n % 3 * 14;
    if (x > 472 && x < 580 && y < 448 || x > 1000 && y < 440) continue;
    // Keep authored roadside foliage wholly off roads and paved parking bays.
    if (![x, x + 24].every(px => [y, y + 36].every(py => tileAt(m, Math.floor(px / TILE), Math.floor(py / TILE)) === 'grass'))) continue;
    prop(m, n % 4 ? "bush" : "pine", x, y, n % 4 ? 22 : 24, n % 4 ? 14 : 36);
    prop(m, "flower", x + 19, y + 16, 18, 12);
  }
  for (const [x, y, w] of [[766, 473, 26], [307, 483, 18], [990, 450, 22]]) prop(m, "puddle", x, y, w, 7);
  for (let n = 0; n < 16; n++) {
    const x = 950 + (n * 29) % 235, y = 244 + (n * 41) % 184;
    if (x < 1008 || y > 415) prop(m, n % 3 ? "debris" : "rock", x, y, n % 3 ? 11 : 22, n % 3 ? 7 : 17);
  }
  prop(m, "crater", 916, 368, 38, 25); prop(m, "crater", 1187, 400, 30, 20);
  road(m, { id: 'launch', x: 1552, y: 416, w: 64, h: 96, direction: 'vertical', start: 'entrance', end: 'junction' });
  compound(m, 1328, 80);
  prop(m,"barrier",1536,410,96,8,"Pedestrian gate · park taxi outside");
  m.spawn = { x: 208, y: 480 }; scatter(m, "grass", 9); if (expanded) dressCounty(m); return m;
};
export const OVERWORLD = makeOverworld(true);
// Frozen authored content for parties until a versioned county capability exists.
export const COOP_OVERWORLD = makeOverworld(false);
export const HUB_WORLD = (() => {
  const m = map("hub", "Wayside Town", 60, 34, "grass"); boundary(m, "grass");
  paint(m, 448, 160, 64, 352, "dirt");
  paint(m, 128, 224, 80, 80, "dirt"); paint(m, 736, 240, 80, 64, "dirt");
  paint(m, 352, 160, 256, 80, "stone");
  paint(m, 64, 384, 208, 112, "sand"); paint(m, 80, 400, 176, 80, "water", true);
  road(m, { id: 'town', x: 32, y: 288, w: 896, h: 64, direction: 'horizontal', start: 'barrier', end: 'barrier' });
  paint(m, 512, 400, 80, 64, 'stone'); // Taxi parking joins the town footpath.
  prop(m, "station", 368, 64, 224, 112, "Wayside Station");
  prop(m, "shop", 104, 144, 128, 80, "Shop");
  prop(m, "home", 704, 144, 144, 96, "Home");
  prop(m, "shed", 672, 384, 80, 64);
  prop(m, "bbq", 768, 400, 32, 32); prop(m, "fence", 672, 480, 192, 12);
  prop(m, "npc", 816, 384, 16, 24, "Jon"); prop(m, "npc", 336, 224, 16, 24, "Alex");
  parkedCar(m, 520, 424, 40, 24); prop(m, "sign", 412, 408, 24, 24, "Taxi");
  for (let x = 256; x < 704; x += 112) { prop(m, "lamp", x, 260, 12, 32); prop(m, "flower", x + 32, 360, 24, 12); }
  m.spawn = { x: 480, y: 416 }; scatter(m, "grass", 2); return m;
})();

export const WATCHER_ROOM = 7;
export const GATEKEEPER_ROOM = 4;
const ZONES = [
  ["Scorched Road", 40, 24], ["Split Creek", 60, 34], ["Ruined Yard", 40, 24],
  ["Furnace Pass", 80, 34], ["Sentinel Gate", 40, 24], ["Shattered Courtyard", 60, 34],
  ["Rift Approach", 40, 24], ["The Watcher's Hollow", 40, 24],
  ["Ash Orchard", 40, 24], ["Old Supply Depot", 40, 24],
] as const;
export const BLAST_WORLDS: WorldMap[] = ZONES.map(([name, cols, rows], room) => {
  const m = map(`blast-${room}`, name, cols, rows, "ash"); boundary(m, "stone", "pine");
  const cy = m.spawn.y;
  paint(m, 32, cy - 64, m.width - 64, 128, "dirt");
  paint(m, 112, cy - 80, 64, 16, "sand"); paint(m, m.width - 192, cy + 64, 112, 16, "sand");
  if (room === 1) {
    paint(m, 432, 32, 96, m.height - 64, "sand"); paint(m, 448, 32, 64, m.height - 64, "water", true);
    paint(m, 416, cy - 48, 128, 96, "bridge"); paint(m, 288, 0, 80, cy + 32, "dirt");
  }
  if (room === 2 || room === 5 || room === 9) {
    prop(m, "shed", m.width - 208, 64, 112, 72);
    prop(m, "fence", 96, m.height - 80, 144, 12);
    paint(m, 368, 96, 64, Math.max(48, cy - 144), 'stone'); // Parking drive meets each room's main path.
    parkedCar(m, 384, 104, 40, 24);
  }
  if (room === 3) {
    paint(m, 640, cy, 96, m.height - cy, "dirt");
    paint(m, 144, 32, 192, 112, "stone", true); paint(m, 656, 64, 208, 96, "stone", true);
  }
  if (room === 4) {
    paint(m, 160, cy - 80, 320, 160, "stone");
    prop(m, "lamp", 184, cy - 100, 16, 40); prop(m, "lamp", 456, cy - 100, 16, 40);
  }
  if (room === 6 || room === 7) {
    paint(m, 176, cy - 96, 352, 192, "corrupt");
    prop(m, "crater", 232, cy - 64, 176, 112);
    prop(m, "portal", m.width - 104, cy - 80, 48, 64);
  }
  if (room < 8) {
    exit(m, { id: "west", name: room === 0 ? "Return to taxi" : ZONES[room - 1][0],
      x: 0, y: cy - 48, w: 48, h: 96, target: room === 0 ? "overworld" : room - 1,
      entryX: room === 0 ? 1088 : ZONES[room - 1][1] * TILE - 64,
      entryY: room === 0 ? 400 : Math.floor(ZONES[room - 1][2] / 2) * TILE });
    exit(m, { id: "east", name: room === WATCHER_ROOM ? "Enter the realm rift" : ZONES[room + 1][0],
      x: m.width - 48, y: cy - 48, w: 48, h: 96, target: room === WATCHER_ROOM ? "realm" : room + 1,
      entryX: 56, entryY: room === WATCHER_ROOM ? 192 : Math.floor(ZONES[room + 1][2] / 2) * TILE, requiresClear: true });
  }
  if (room === 1) exit(m, { id: "north", name: "Ash Orchard · optional", x: 288, y: 0, w: 80, h: 48,
    target: 8, entryX: 328, entryY: 320 });
  if (room === 3) exit(m, { id: "south", name: "Old Supply Depot · optional", x: 640, y: m.height - 48, w: 96, h: 48,
    target: 9, entryX: 328, entryY: 64 });
  if (room === 8 || room === 9) {
    paint(m, 288, 32, 80, m.height - 64, "dirt");
    const orchard = room === 8;
    // The optional branch has one exit; its other end stops at a closed rail.
    prop(m, 'barrier', 288, orchard ? 32 : m.height - 40, 80, 8);
    exit(m, { id: orchard ? "south" : "north", name: orchard ? "Split Creek" : "Furnace Pass",
      x: 288, y: orchard ? m.height - 48 : 0, w: 80, h: 48, target: orchard ? 1 : 3,
      entryX: orchard ? 328 : 688, entryY: orchard ? 64 : 480 });
    const chest = prop(m, "chest", 480, cy - 16, 24, 24, orchard ? "Orchard cache" : "Supply cache");
    chest.id = `loot-blast-${room}`;
    if (orchard) prop(m, "npc", 144, 128, 16, 24, "Stranded scout");
  }
  if (room === WATCHER_ROOM || room === GATEKEEPER_ROOM) {
    m.spawns = [{ kind: "boss", x: room === WATCHER_ROOM ? 464 : 368, y: cy, miniBoss: room === GATEKEEPER_ROOM }];
  } else {
    const anchors = m.width > 1000 ? [240, 500, 760, 1020] : m.width > 800 ? [240, 480, 720] : [240, 448];
    for (const x of anchors) encounter(m, x, cy + (room === 6 && x < 400 ? 80 : 0));
  }
  scatter(m, "ash", room + 5);
  return m;
});
export const REALM_WORLD = (() => {
  const m = map("realm-0", "The 8-Bit Realm", 40, 24, "corrupt"); boundary(m, "void", "pine");
  paint(m, 32, 128, 576, 128, "stone");
  prop(m, "portal", 552, 96, 48, 64);
  exit(m, { id: "east", name: "Return to Wayside", x: 592, y: 144, w: 48, h: 96,
    target: "hub", targetMapId: "hub", entryX: 480, entryY: 416, requiresClear: true });
  encounter(m, 240, 192, "pumpkin"); encounter(m, 448, 192, "ghost"); return m;
})();
export const TEST_WORLD = (() => {
  const m = map("training", "Training Yard", 20, 12, "grass");
  m.height = 180; // Authored training-yard boundary, independent of the camera.
  paint(m, 0, 0, 320, 48, "stone", true); paint(m, 0, 168, 320, 24, "stone", true);
  paint(m, 0, 0, 16, 192, "stone", true); paint(m, 304, 0, 16, 192, "stone", true);
  m.spawn = { x: 75, y: 110 }; return m;
})();
for (const world of [...BLAST_WORLDS, REALM_WORLD]) for (const door of world.exits) {
  door.targetMapId ??= typeof door.target === "number" ? `blast-${door.target}` : door.target === "realm" ? "realm-0" : door.target;
}

export function getWorld(scene: string, room = 0, mapId?: string, coop = false): WorldMap {
  if (coop && (mapId === "overworld" || !mapId && scene === "overworld")) return COOP_OVERWORLD;
  if (mapId) return ALL_WORLDS.find(world => world.id === mapId) ?? HUB_WORLD;
  return scene === "overworld" ? OVERWORLD : scene === "hub" ? HUB_WORLD : scene === "dungeon" ? BLAST_WORLDS[room] ?? BLAST_WORLDS[0] : scene === "realm" ? REALM_WORLD : TEST_WORLD;
}

export const ALL_WORLDS = [OVERWORLD, HUB_WORLD, ...BLAST_WORLDS, REALM_WORLD, TEST_WORLD, LAUNCH_WORLD, ...MOON_WORLDS, ...CITY_WORLDS, ...WOODS_WORLDS];
