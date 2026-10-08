import { readFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceTextModule } from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { sanitizeWorldSave } from '../shared/waysideFury/u1World.js';
import { cleanWorld } from '../wayside-fury/protocol.js';

// Exercise the browser's pure TypeScript rules directly, without a second copy.
const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../src/pages/WaysideFury/game');
const modules = new Map();
function createTs(path) {
    if (modules.has(path)) return modules.get(path);
    const source = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
    }).outputText;
    const module = new SourceTextModule(source, { identifier: path });
    modules.set(path, module);
    return module;
}
async function loadTs(path) {
    const module = createTs(path);
    if (module.status === 'unlinked') await module.link((specifier, referencing) => {
        const dependency = resolve(dirname(referencing.identifier), specifier);
        return createTs(extname(dependency) ? dependency : `${dependency}.ts`);
    });
    if (module.status === 'linked') await module.evaluate();
    return module;
}
const rules = (await loadTs(resolve(sourceRoot, 'u1/world/dayNight.ts'))).namespace;
const lighting = (await loadTs(resolve(sourceRoot, 'u1/world/dayNightRender.ts'))).namespace;
const worldRules = modules.get(resolve(sourceRoot, 'world.ts')).namespace;

describe('Wayside Fury eight-minute world clock', () => {
    test('old saves and invalid persisted clocks migrate to daylight; finite clocks remain bounded', () => {
        for (const value of [undefined, null, '240', {}, [], NaN, Infinity, -Infinity, -1]) {
            expect(rules.sanitizeDayNightSeconds(value)).toBe(0);
        }
        for (const value of [0, 240.125, 480, 1441.5, Number.MAX_VALUE]) {
            const seconds = rules.sanitizeDayNightSeconds(value);
            expect(seconds).toBeGreaterThanOrEqual(0);
            expect(seconds).toBeLessThan(480);
            expect(rules.sanitizeDayNightSeconds(seconds)).toBe(seconds);
        }
        expect(rules.sanitizeDayNightSeconds(1441.5)).toBe(1.5);
    });

    test('clock advances in real seconds, wraps exactly, and ignores invalid elapsed time', () => {
        expect(rules.DAY_NIGHT_CYCLE_SECONDS).toBe(480);
        expect(rules.advanceDayNightSeconds(479.5, .75)).toBe(.25);
        expect(rules.advanceDayNightSeconds(80, 480)).toBe(80);
        expect(rules.advanceDayNightSeconds(80, 480 * 24 + 300)).toBe(380);
        for (const elapsed of [0, -10, NaN, Infinity]) expect(rules.advanceDayNightSeconds(40, elapsed)).toBe(40);
    });

    test('night lighting eases across dusk and dawn with continuous cycle boundaries', () => {
        expect(rules.sampleDayNight(0).phase).toBe('day');
        expect(rules.sampleDayNight(180).phase).toBe('dusk');
        expect(rules.sampleDayNight(240).phase).toBe('night');
        expect(rules.sampleDayNight(420).phase).toBe('dawn');
        expect(rules.sampleDayNight(210).nightFactor).toBe(.5);
        expect(rules.sampleDayNight(450).nightFactor).toBe(.5);
        expect(rules.sampleDayNight(300)).toMatchObject({ nightFactor: 1, ambient: .5, isNight: true });
        for (const boundary of [180, 240, 420, 480]) {
            const before = rules.sampleDayNight(boundary - .001);
            const after = rules.sampleDayNight(boundary + .001);
            expect(Math.abs(before.nightFactor - after.nightFactor)).toBeLessThan(.00001);
        }
        for (let seconds = 0; seconds < 480; seconds += 20) {
            const sample = rules.sampleDayNight(seconds);
            expect(sample.nightFactor).toBeGreaterThanOrEqual(0);
            expect(sample.nightFactor).toBeLessThanOrEqual(1);
            expect(sample.ambient).toBeGreaterThanOrEqual(.5);
            expect(sample.ambient).toBeLessThanOrEqual(1);
        }
    });
});

describe('host-owned ambient night encounters', () => {
    test('only night has encounters; guests and other maps never generate world monsters', () => {
        for (const seconds of [0, 180, 239.999, 420, 479.9]) {
            expect(rules.nightEncounterWindow(seconds)).toBeNull();
            expect(rules.getNightEncounterSpawns(seconds)).toEqual([]);
        }
        expect(rules.getNightEncounterSpawns(300, worldRules.OVERWORLD, { authority: 'guest' })).toEqual([]);
        expect(rules.getNightEncounterSpawns(300, worldRules.HUB_WORLD)).toEqual([]);
        expect(rules.getNightEncounterSpawns(300, worldRules.OVERWORLD, { authority: 'host' })).toHaveLength(2);
    });

    test('every batch is deterministic, distinct and clear of terrain, props and road traffic', () => {
        const batches = [];
        for (let seconds = 240; seconds < 420; seconds += 36) {
            const spawns = rules.getNightEncounterSpawns(seconds);
            expect(spawns).toEqual(rules.getNightEncounterSpawns(seconds + 10));
            expect(spawns).toHaveLength(2);
            expect(spawns.map(spawn => spawn.sprite).sort()).toEqual(['ghost', 'pumpkin']);
            expect(Math.hypot(spawns[0].x - spawns[1].x, spawns[0].y - spawns[1].y)).toBeGreaterThan(30);
            for (const spawn of spawns) {
                expect(worldRules.isBlocked(worldRules.OVERWORLD, spawn.x, spawn.y, 12)).toBe(false);
                const tile = worldRules.OVERWORLD.tiles[Math.floor(spawn.y / 16) * worldRules.OVERWORLD.cols + Math.floor(spawn.x / 16)];
                expect(tile).toBe('grass');
            }
            batches.push(spawns);
        }
        expect(new Set(batches.map(batch => JSON.stringify(batch))).size).toBe(5);
    });

    test('resuming after skipped windows plans at most one batch and repeated snapshots do not respawn', () => {
        const first = rules.planNightEncounter(241, null);
        expect(first.spawns).toHaveLength(2);
        expect(rules.planNightEncounter(270, first.window).spawns).toEqual([]);
        const resumed = rules.planNightEncounter(405, first.window);
        expect(resumed.window).toBe('night:4');
        expect(resumed.spawns).toHaveLength(2);
        expect(rules.planNightEncounter(419, resumed.window).spawns).toEqual([]);
        expect(rules.planNightEncounter(480, resumed.window)).toEqual({ window: null, spawns: [] });
    });

    test('unavailable terrain skips spawns and occupied players receive clearance', () => {
        const blocked = { ...worldRules.OVERWORLD, collision: worldRules.OVERWORLD.collision.map(() => 1) };
        expect(rules.getNightEncounterSpawns(300, blocked)).toEqual([]);
        const original = rules.getNightEncounterSpawns(300);
        const occupied = original.map(spawn => ({ x: spawn.x, y: spawn.y, radius: 20 }));
        const moved = rules.getNightEncounterSpawns(300, worldRules.OVERWORLD, { occupied });
        for (const spawn of moved) for (const body of occupied) {
            expect(Math.hypot(spawn.x - body.x, spawn.y - body.y)).toBeGreaterThanOrEqual(44);
        }
    });
});

describe('shared day/night light sources', () => {
    test('daylight emits no artificial light, night retains lamps, portal glows and both headlights', () => {
        const focus = { x: 208, y: 480, faceX: 1, faceY: 0 };
        expect(lighting.collectDayNightLights(worldRules.OVERWORLD, rules.sampleDayNight(0), focus)).toEqual([]);
        const lights = lighting.collectDayNightLights(worldRules.OVERWORLD, rules.sampleDayNight(300), focus,
            [{ x: 512, y: 400, sprite: 'ghost' }, { x: 700, y: 540, sprite: 'pumpkin' }]);
        expect(lights.filter(light => light.kind === 'headlight')).toHaveLength(2);
        expect(lights.filter(light => light.kind === 'lamp')).toHaveLength(worldRules.OVERWORLD.props.filter(prop => prop.kind === 'lamp').length);
        expect(lights.filter(light => light.kind === 'portal')).toHaveLength(2);
        expect(lights.filter(light => light.kind === 'monster').map(light => light.color)).toEqual(['#9ee6d9', '#ffa75a']);
        expect(new Set(lights.map(light => light.id)).size).toBe(lights.length);
        for (const light of lights) {
            expect(light.intensity).toBeGreaterThan(0);
            expect(light.intensity).toBeLessThanOrEqual(1);
        }
    });

    test('headlights follow a normalized facing vector and fade smoothly during twilight', () => {
        const focus = { x: 500, y: 480, faceX: 3, faceY: 4 };
        const night = lighting.collectDayNightLights(worldRules.OVERWORLD, rules.sampleDayNight(300), focus).filter(light => light.kind === 'headlight');
        const dusk = lighting.collectDayNightLights(worldRules.OVERWORLD, rules.sampleDayNight(210), focus).filter(light => light.kind === 'headlight');
        expect(night[0].angle).toBeCloseTo(Math.atan2(4, 3));
        expect(Math.hypot(night[0].x - 500, night[0].y - 477)).toBeCloseTo(13);
        expect(dusk[0].intensity).toBeCloseTo(night[0].intensity / 2);
        const stopped = lighting.collectDayNightLights(worldRules.OVERWORLD, rules.sampleDayNight(300), { ...focus, faceX: 0, faceY: 0 });
        expect(stopped.find(light => light.kind === 'headlight').angle).toBe(0);
    });
});

describe('day/night world runtime', () => {
    test('host clock, per-player guest clock, bounded ambient population and collision remain honest', async () => {
        const runtime = (await loadTs(resolve(sourceRoot, 'u1/world/dayNightRuntime.ts'))).namespace;
        const sim = (await loadTs(resolve(sourceRoot, 'sim.ts'))).namespace;
        const obstacles = (await loadTs(resolve(sourceRoot, 'u1/world/obstacles.ts'))).namespace;
        const s = sim.newGame(); s.scene = 'overworld'; s.enemies = [];
        s.x = 208; s.y = 480;
        assert.equal(runtime.worldCycleSeconds(s), 0);
        runtime.advanceWorldClock(s, 241);
        assert.equal(obstacles.worldSave(s).cycleSeconds, 241);
        runtime.updateNightOverworld(s, 0);
        assert.equal(s.enemies.length, 2);
        assert.ok(s.enemies.every(e => e.nightAmbient && ['ghost', 'pumpkin'].includes(e.sprite)));
        const rewardState = { candy: s.candy, kills: s.kills, events: s.events.length };
        runtime.updateNightOverworld(s, 0);
        assert.equal(s.enemies.length, 2);
        for (let tick = 0; tick < 120; tick++) {
            runtime.updateNightOverworld(s, .05);
            for (const enemy of s.enemies) {
                assert.equal(worldRules.isBlocked(worldRules.OVERWORLD, enemy.x, enemy.y, enemy.radius), false);
                assert.equal(obstacles.obstacleBlocks(s, enemy.x, enemy.y, enemy.radius), false);
                assert.equal(worldRules.OVERWORLD.tiles[Math.floor(enemy.y / 16) * worldRules.OVERWORLD.cols + Math.floor(enemy.x / 16)], 'grass');
            }
        }
        assert.deepEqual({ candy: s.candy, kills: s.kills, events: s.events.length }, rewardState);
        // Creatures scatter when a taxi approaches them.
        const monster = s.enemies[0]; s.x = monster.x - 10; s.y = monster.y;
        const before = Math.hypot(monster.x - s.x, monster.y - s.y);
        runtime.updateNightOverworld(s, .05);
        assert.ok(Math.hypot(monster.x - s.x, monster.y - s.y) > before);
        s.x = 208; s.y = 480;
        for (const seconds of [278, 314, 350, 386]) {
            obstacles.worldSave(s).cycleSeconds = seconds; runtime.updateNightOverworld(s, .05);
        }
        assert.ok(s.enemies.length <= 6); assert.ok(s.enemies.length >= 4);
        // Skipping multiple windows cannot replay missed batches.
        runtime.resetNightEncounter(s); s.enemies = []; obstacles.worldSave(s).cycleSeconds = 405;
        runtime.updateNightOverworld(s, 0); assert.ok(s.enemies.length <= 2);
        obstacles.worldSave(s).cycleSeconds = 420; runtime.updateNightOverworld(s, 0);
        assert.equal(s.enemies.length, 0); assert.equal(s.nightWorld.window, null);
        const guest = sim.newGame(); guest.scene = 'overworld'; guest.enemies = [];
        obstacles.worldSave(guest).cycleSeconds = 60;
        guest.coop = { role: 'guest', seat: 1, remoteHeroes: [], appliedHits: [], worldCycleSeconds: 300 };
        assert.equal(runtime.worldCycleSeconds(guest), 300);
        runtime.advanceWorldClock(guest, 70); runtime.updateNightOverworld(guest, .05);
        assert.equal(obstacles.worldSave(guest).cycleSeconds, 60); assert.equal(guest.enemies.length, 0);
        const host = sim.newGame(); host.coop = { role: 'host', seat: 0, remoteHeroes: [], appliedHits: [] };
        runtime.advanceWorldClock(host, 479.5); runtime.advanceWorldClock(host, 1);
        assert.equal(host.coop.worldCycleSeconds, .5); assert.equal(runtime.worldCycleSeconds(host), .5);
    });
});

describe('night persistence, protocol and reward boundaries', () => {
    test('shared save migration bounds the clock and retains discoveries', () => {
        expect(sanitizeWorldSave(undefined)).toEqual({ clearedObstacles: [], cycleSeconds: 0 });
        expect(sanitizeWorldSave({ cycleSeconds: -1 }).cycleSeconds).toBe(0);
        expect(sanitizeWorldSave({ cycleSeconds: 960.25 }).cycleSeconds).toBe(.25);
        expect(sanitizeWorldSave({ cycleSeconds: Infinity }).cycleSeconds).toBe(0);
    });
    test('wire clock and encounter IDs reject malformed data without throwing', async () => {
        const sim = (await loadTs(resolve(sourceRoot, 'sim.ts'))).namespace;
        const state = { ...sim.newGame(), worldCycleSeconds: 300, nightEncounterWindow: 'night:1' };
        expect(cleanWorld(state)).toBe(state);
        for (const worldCycleSeconds of [-1, 480, Infinity, NaN, '300']) expect(cleanWorld({ ...state, worldCycleSeconds })).toBeNull();
        for (const nightEncounterWindow of ['night:5', ['night:0'], 3, {}]) expect(cleanWorld({ ...state, nightEncounterWindow })).toBeNull();
        expect(cleanWorld({ ...state, enemies: [null] })).toBeNull();
    });
    test('ambient creatures reject remote hits and cannot farm rewards or block context Attack', async () => {
        const sim = (await loadTs(resolve(sourceRoot, 'sim.ts'))).namespace;
        const runtime = (await loadTs(resolve(sourceRoot, 'u1/world/dayNightRuntime.ts'))).namespace;
        const obstacles = (await loadTs(resolve(sourceRoot, 'u1/world/obstacles.ts'))).namespace;
        const state = sim.newGame(); sim.enterScene(state, 'overworld');
        state.coop = { role: 'host', seat: 0, remoteHeroes: [], appliedHits: [] };
        runtime.advanceWorldClock(state, 300); runtime.updateNightOverworld(state, 0);
        const creature = state.enemies[0], hp = creature.hp;
        expect(sim.applyCoopHit(state, { type: 'coop-hit', enemyId: creature.id, damage: 999, dx: 1, dy: 0, force: 20, attackId: 'ambient-farm' }, 1)).toBe(false);
        expect(creature.hp).toBe(hp); expect(state.events.some(event => event.type === 'kill')).toBe(false);
        sim.setCoopPlayerCount(state, 4);
        expect(state.enemies.every(enemy => enemy.nightAmbient)).toBe(true);
        const gate = obstacles.HERO_OBSTACLES.find(g => g.worldId === 'overworld');
        state.active = gate.hero; state.x = gate.x + gate.w / 2; state.y = gate.y + gate.h + 13;
        creature.x = state.x + 12; creature.y = state.y;
        for (let i = 0; i < 10; i++) sim.step(state, sim.idleInput(), 1 / 60);
        sim.step(state, { ...sim.idleInput(), attack: true }, 1 / 60);
        expect(obstacles.isObstacleCleared(state, gate.id)).toBe(true);
        expect(state.candy).toBe(0); expect(state.kills).toBe(0);
    });
    test('night score blends sparse ambience without changing or mutating the day score', async () => {
        const music = (await loadTs(resolve(sourceRoot, 'u1/world/nightMusic.ts'))).namespace;
        const base = [{ lane: 'lead', instrument: 'pulse', midi: 67, duration: 2, volume: .1, priority: 5 }];
        expect(music.mixNightScore(base, 0, 0, 0)).toEqual(base);
        const night = music.mixNightScore(base, 0, 0, 1), dusk = music.mixNightScore(base, 0, 0, .5);
        expect(base[0].volume).toBe(.1); expect(night).toHaveLength(3);
        expect(night[0].volume).toBeLessThan(dusk[0].volume);
        expect(night.filter(note => note.instrument === 'sine')).toHaveLength(1);
        expect(music.mixNightScore(base, 0, 0, NaN)).toEqual(base);
    });
});
