// Bundle the existing co-op runtime because Node 26 cannot strip parameter properties.
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const SOURCE = String.raw`
import assert from 'node:assert/strict';
import { FuryCoop } from '../src/pages/WaysideFury/game/coop.ts';
import { newGame, enterScene, idleInput } from '../src/pages/WaysideFury/game/sim.ts';
import { updateNightOverworld, worldCycleSeconds, advanceWorldClock } from '../src/pages/WaysideFury/game/u1/world/dayNightRuntime.ts';
const host=newGame();enterScene(host,'overworld');host.worldCycleSeconds=300;updateNightOverworld(host,1/60);
const snapshot={...host,worldCycleSeconds:300,nightEncounterWindow:host.nightWorld.window,protocolVersion:6};
const guest=newGame();guest.worldCycleSeconds=72;guest.coop={role:'guest',seat:1,remoteHeroes:[],appliedHits:[]};
const coop=new FuryCoop({onRoom(){},onToast(){},onAvatar(){}});
coop.room={seat:1,hostSeat:0,players:[{seat:0,connected:true},{seat:1,connected:true}],protocolVersion:6};
coop.worlds=[{at:0,value:snapshot}];coop.latestWorld=snapshot;
coop.update(guest,idleInput(),100);assert.equal(worldCycleSeconds(guest),300);assert.equal(guest.worldCycleSeconds,72);
advanceWorldClock(guest,60);assert.equal(guest.worldCycleSeconds,72);
assert.deepEqual(guest.enemies.map(e=>e.id),host.enemies.map(e=>e.id));
coop.room.hostSeat=1;coop.update(guest,idleInput(),101);
assert.equal(guest.worldCycleSeconds,300);assert.equal(guest.nightWorld.window,host.nightWorld.window);
assert.deepEqual(guest.enemies.map(e=>e.id),host.enemies.map(e=>e.id));
const count=guest.enemies.length;updateNightOverworld(guest,1/60);assert.equal(guest.enemies.length,count);
console.log('U9 real FuryCoop snapshot application and host migration pass without clock borrowing or duplicate batches.');
`;
const folder = await mkdtemp(join(tmpdir(), 'fury-u9-coop-'));
try {
  const result = await build({ stdin: { contents: SOURCE, resolveDir: fileURLToPath(new URL('.', import.meta.url)), loader: 'js' },
    bundle: true, platform: 'node', format: 'esm', write: false,
    define: { 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'http://wayside-fury-local.invalid', VITE_SUPABASE_ANON_KEY: 'local-fixture' }) },
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' } });
  const target = join(folder, 'check.mjs');
  await writeFile(target, result.outputFiles[0].contents);
  await import(pathToFileURL(target).href);
} finally { await rm(folder, { recursive: true, force: true }); }
