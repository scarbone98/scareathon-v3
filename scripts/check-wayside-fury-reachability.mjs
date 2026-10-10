// Overworld reachability audit: floods the walkable space from the spawn with
// the real collision rule (isBlocked, hero radius 10) and lists every road,
// bridge, door, landmark and interactable the hero cannot reach, plus overlaps
// (building on road, prop in water, mailbox inside a wall, bridge end in water).
//   node scripts/check-wayside-fury-reachability.mjs [--json] [--coop] [--strict]
// --strict exits 1 on any error-severity issue not in the known-issue baseline.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OVERWORLD, COOP_OVERWORLD, ALL_WORLDS } from '../src/pages/WaysideFury/game/world.ts';
import { LOCATIONS } from '../src/pages/WaysideFury/game/content.ts';
import { COUNTY_STOPS } from '../src/pages/WaysideFury/game/county.ts';
import { INTERIORS } from '../server/shared/waysideFury/interiors.js';
import { HIDDEN_PICKUPS } from '../server/shared/waysideFury/collectibles.js';
import { auditWorld } from '../src/pages/WaysideFury/game/reachabilityAudit.ts';

export const BASELINE_PATH = fileURLToPath(new URL('./fixtures/wayside-fury-reachability-baseline.json', import.meta.url));

// Interaction radii mirror interactTarget() in sim.ts.
export function overworldOptions(world, { coop = false } = {}) {
  const sign = world.props.find(p => p.id === 'roadside-lore-sign');
  const targets = [
    ...LOCATIONS.map(l => ({ id: `location-${l.id}`, name: `Taxi stop ${l.name}`, x: l.x, y: l.y, radius: 72 })),
    ...(coop ? [] : COUNTY_STOPS.map(s => ({ id: `county-stop-${s.id}`, name: s.name, x: s.x, y: s.y, radius: 46 }))),
    ...(sign ? [{ id: sign.id, name: 'Roadside lore sign', x: sign.x + sign.w / 2, y: sign.y + sign.h, radius: 46 }] : []),
    ...HIDDEN_PICKUPS.filter(p => p.scene === 'overworld' && !p.requiresDiner).map(p => ({ id: p.id, name: `Pickup "${p.name}"`, x: p.x, y: p.y, radius: 28 })),
  ];
  const doors = INTERIORS.filter(room => room.parent === 'overworld').map(room => ({ id: room.id, name: `Door: ${room.name}`, x: room.x, y: room.y, building: room.building }));
  const arrivals = ALL_WORLDS.flatMap(m => m.exits.filter(e => (e.targetMapId ?? e.target) === 'overworld').map(e => ({ id: `arrival-${m.id}-${e.id}`, name: `Arrival from ${m.id} (${e.name})`, x: e.entryX, y: e.entryY, radius: 12 })));
  // compound(m, 1328, 80) in world.ts: the launch site is entered through its own
  // map from the 'space' taxi stop, never by driving through the fence.
  const sealed = [{ id: 'launch-compound', name: 'Launch compound fence (overworld)', rect: { x: 1328, y: 80, w: 512, h: 336 } }];
  return { heroRadius: 10, doors, targets, arrivals, sealed };
}

export function auditOverworld({ coop = false } = {}) {
  const worlds = [['overworld', OVERWORLD, false], ...(coop ? [['coop-overworld', COOP_OVERWORLD, true]] : [])];
  const stats = {};
  const issues = worlds.flatMap(([name, world, isCoop]) => {
    const result = auditWorld(world, overworldOptions(world, { coop: isCoop }));
    stats[name] = result.stats;
    return result.issues.map(issue => ({ ...issue, key: isCoop ? `coop:${issue.key}` : issue.key, map: name }));
  });
  return { issues, stats };
}

export function loadBaseline() {
  try { return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).known ?? []; } catch { return []; }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const { issues, stats } = auditOverworld({ coop: args.has('--coop') });
  if (args.has('--json')) console.log(JSON.stringify({ stats, issues }, null, 2));
  else {
    for (const [name, s] of Object.entries(stats)) console.log(`${name}: ${Math.round(s.reachedArea / 1000)}k px² walkable from spawn; ${s.roadSamples} road samples, ${s.crossings} water crossings, ${s.doors} doors, ${s.targets} interaction/arrival anchors, ${s.props} props checked.`);
    const errors = issues.filter(i => i.severity === 'error'), warnings = issues.filter(i => i.severity === 'warning');
    console.log(`Wayside Fury reachability: ${errors.length} error(s), ${warnings.length} warning(s).`);
    for (const [title, list] of [['ERRORS', errors], ['WARNINGS', warnings]]) {
      if (!list.length) continue;
      console.log(`\n${title}`);
      for (const i of list) console.log(`- [${i.map}] ${i.kind} @ ${i.x},${i.y}: ${i.detail}\n    fix: ${i.fix}`);
    }
  }
  if (args.has('--strict')) {
    const known = new Set(loadBaseline());
    const fresh = issues.filter(i => i.severity === 'error' && !known.has(i.key));
    if (fresh.length) { console.error(`\n${fresh.length} new error(s) not in the baseline:\n${fresh.map(i => `  ${i.key}`).join('\n')}`); process.exit(1); }
  }
}
