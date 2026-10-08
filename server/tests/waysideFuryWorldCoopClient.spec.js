import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm';
import ts from 'typescript';
import * as worldSave from '../shared/waysideFury/u1World.js';

// Run the actual client queue and obstacle validator with a controlled receipt
// clock; transport, unrelated combat, and rendering remain outside this check.
let receivedAt = 1000;
const context = createContext({
    crypto: { randomUUID: () => 'world-coop-test' }, performance: { now: () => receivedAt },
    WebSocket: { OPEN: 1 }, structuredClone, clearTimeout,
});
const synthetic = (exports) => new SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
}, { context });
const source = (relative) => new SourceTextModule(ts.transpileModule(
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } },
).outputText, { context });
const obstacles = source('../../src/pages/WaysideFury/game/u1/world/obstacles.ts');
await obstacles.link(specifier => specifier.endsWith('/u1World.js') ? synthetic(worldSave)
    : synthetic({ getWorld: () => ({}), isBlocked: () => false }));
const sim = synthetic({
    activeHero: state => state.heroes[state.active], applyCoopHit: () => false,
    applyCoopDamage: () => {}, reviveCoopHero: () => false, setCoopPlayerCount: () => {},
    syncCoopLevel: () => {}, exitCoop: state => { delete state.coop; },
    enterScene: (state, scene, room) => { state.scene = scene; state.room = room; },
});
const dependencies = {
    './coopRewards': synthetic({ applyCoopReward: () => false, rollCoopCandy: () => 0 }),
    './u1/world/obstacles': obstacles,
    './u1/world/dayNightRuntime': synthetic({ worldCycleSeconds: () => 0 }),
    './world': synthetic({ GATEKEEPER_ROOM: 4, WATCHER_ROOM: 7 }),
    '../../../fetchWithAuth': synthetic({ fetchWithAuth: () => { throw new Error('Unexpected transport'); } }),
    './sim': sim,
};
const client = source('../../src/pages/WaysideFury/game/coop.ts');
await client.link(specifier => {
    if (!dependencies[specifier]) throw new Error(`Unexpected client dependency: ${specifier}`);
    return dependencies[specifier];
});
await client.evaluate();
const { FuryCoop } = client.namespace;
const gate = obstacles.namespace.HERO_OBSTACLES.find(entry => entry.id === 'world-joe-road');
const idle = { x: 0, y: 0, attack: false, ki: false, dash: false, guard: false, swap: false, interact: false };
const room = () => ({ seat: 0, hostSeat: 0, players: [
    { seat: 0, userId: 'host', name: 'Host', connected: true },
    { seat: 1, userId: 'guest', name: 'Guest', connected: true },
] });
function setup() {
    receivedAt = 1000;
    const coop = new FuryCoop({ onRoom: () => {}, onToast: () => {}, onAvatar: () => {} });
    coop.room = room();
    const state = { scene: 'dungeon', room: 0, x: 56, y: 192, active: 'you', heroes: { you: { id: 'you', hp: 40 } },
        enemies: [], projectiles: [], clearedRooms: [], areas: [], bosses: [], events: [], u1: { world: { clearedObstacles: [], cycleSeconds: 0 } },
        coop: { role: 'host', seat: 0, remoteHeroes: [], appliedHits: [] }, time: 1, chapter: 1, rngSeed: 1, nextId: 1 };
    const hero = (overrides = {}) => coop.receive({ type: 'hero', seat: 1, input: idle,
        hero: { x: gate.x + gate.w / 2, y: gate.y + gate.h + 12, scene: 'dungeon', room: 0,
            hero: { id: 'joe', hp: 40 }, ...overrides } });
    const request = (overrides = {}) => coop.receive({ type: 'obstacle', seat: 1, id: gate.id, scene: 'dungeon', room: 0, ...overrides });
    const update = () => coop.update(state, idle, receivedAt);
    const cleared = () => state.u1.world.clearedObstacles.includes(gate.id);
    return { coop, state, hero, request, update, cleared };
}

describe('host obstacle action receipt', () => {
    test('a fresh request retains its action pose across a delayed frame and later tag/movement', () => {
        const fixture = setup(); fixture.hero(); receivedAt = 1100; fixture.request();
        receivedAt = 1200; fixture.hero({ x: 1000, y: 1000, hero: { id: 'matt', hp: 0 } });
        receivedAt = 5000; fixture.update();
        expect(fixture.cleared()).toBe(true);
        expect(fixture.state.events.filter(event => event.type === 'obstacle-cleared')).toHaveLength(1);
    });

    test('freshness is bounded at receipt and a later fresh sample cannot rescue a stale request', () => {
        const boundary = setup(); boundary.hero(); receivedAt = 1400; boundary.request(); receivedAt = 5000; boundary.update();
        expect(boundary.cleared()).toBe(true);
        const stale = setup(); stale.hero(); receivedAt = 1400.001; stale.request();
        receivedAt = 1500; stale.hero(); stale.update(); expect(stale.cleared()).toBe(false);
    });

    test('wrong scene, room, hero, health and range remain denied', () => {
        for (const override of [{ scene: 'hub' }, { room: 1 }, { hero: { id: 'matt', hp: 40 } },
            { hero: { id: 'joe', hp: 0 } }, { x: gate.x + 200 }]) {
            const fixture = setup(); fixture.hero(override); fixture.request(); fixture.update();
            expect(fixture.cleared()).toBe(false);
        }
        for (const override of [{ scene: 'hub' }, { room: 1 }]) {
            const fixture = setup(); fixture.hero(); fixture.request(override); fixture.update();
            expect(fixture.cleared()).toBe(false);
        }
    });

    test('consumption still requires the same connected player and current world', () => {
        for (const change of [fixture => { fixture.coop.room.players[1].connected = false; },
            fixture => { fixture.coop.room.players[1].userId = 'replacement'; },
            fixture => { fixture.state.scene = 'hub'; }, fixture => { fixture.state.room = 1; }]) {
            const fixture = setup(); fixture.hero(); fixture.request(); change(fixture); fixture.update();
            expect(fixture.cleared()).toBe(false);
        }
    });

    test('beginRun and leave discard queued actions before a later run or room', () => {
        for (const reset of ['beginRun', 'leave']) {
            const fixture = setup(); fixture.hero(); fixture.request(); fixture.coop[reset]();
            fixture.coop.room = room(); fixture.update(); expect(fixture.cleared()).toBe(false);
        }
    });
});
