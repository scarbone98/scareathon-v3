import type { WorldMap, WorldProp } from "../../game/world.ts";

const cols = 40, rows = 28, width = cols * 16, height = rows * 16;
const tiles: WorldMap["tiles"] = [], collision: number[] = [];
for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
  const wall = x < 2 || y < 2 || x >= cols - 2 || y >= rows - 2;
  const ring = x >= 8 && x < 32 && y >= 6 && y < 22;
  tiles.push(wall ? "void" : ring ? "stone" : "road"); collision.push(wall ? 1 : 0);
}
const props: WorldProp[] = [
  ...[80, 544].flatMap(x => [72, 336].map(y => ({ id: `arena-light-${x}-${y}`, kind: "lamp" as const,
    x, y, w: 16, h: 40, footprints: [{ x: x + 5, y: y + 35, w: 6, h: 6 }] }))),
  { id: "arena-marquee", kind: "sign", x: 304, y: 42, w: 32, h: 24, label: "WAYSIDE TOURNAMENT", footprints: [{ x: 318, y: 60, w: 4, h: 6 }] },
];
export const ARENA_WORLD: WorldMap = { id: "u5-arena", name: "Wayside Tournament", width, height, cols, rows,
  tiles, collision, props, spawns: [], exits: [], spawn: { x: 320, y: 304 } };
export const ARENA_HUB_POINT = { id: "u5-arena", name: "Tournament Arena", x: 624, y: 240 };
export const ARENA_HUB_BUILDING: WorldProp = { id: "u5-arena-building", kind: "shed", x: 584, y: 164, w: 80, h: 64,
  label: "Tournament Arena", color: "#daa759", footprints: [{ x: 587, y: 190, w: 74, h: 38 }] };
