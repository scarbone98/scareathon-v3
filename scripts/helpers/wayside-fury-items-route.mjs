import { isBlocked } from "../../src/pages/WaysideFury/game/world.ts";
// Ported radius-aware swept-grid check, shared by the focused item checks.
const fields = new Map();
export function reachable(world, target) {
  const spacing = 4, cols = Math.floor(world.width / spacing) + 1, rows = Math.floor(world.height / spacing) + 1;
  let seen = fields.get(world);
  if (!seen) {
    seen = new Uint8Array(cols * rows);
    const origin = Math.round(world.spawn.y / spacing) * cols + Math.round(world.spawn.x / spacing);
    const queue = [origin]; seen[origin] = 1;
    for (let i = 0; i < queue.length; i++) {
      const node = queue[i], x = node % cols, y = Math.floor(node / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen[next]) continue;
        let clear = true;
        for (let t = 0; t <= spacing; t++) {
          if (isBlocked(world, x * spacing + dx * t, y * spacing + dy * t, 7)) { clear = false; break; }
        }
        if (clear) { seen[next] = 1; queue.push(next); }
      }
    }
    fields.set(world, seen);
  }
  return seen[Math.round(target.y / spacing) * cols + Math.round(target.x / spacing)] === 1;
}
