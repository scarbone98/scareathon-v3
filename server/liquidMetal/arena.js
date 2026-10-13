// Liquid Metal's arena (github.com/Sclondon/LiquidMetal): a drop-in battle room.
//
// Everyone who opens the arena lands in the same room (a second one opens when the
// first is full) and fights for the most mass before the round's clock runs out:
// run over drops of metal to grow, dash through other runners to burst them, and
// when one bursts most of its mass spills back onto the floor as drops.
//
// Each player's game moves its own runner and streams where it is; this server
// passes that on to the rest. What everyone has to agree on is kept here: who's in
// the room, each runner's mass, which drops are on the floor, who burst whom, and
// the round clock. A game claims a drop or a hit ("take", "hit") and the first
// claim to arrive wins.
//
// The arena is a round colosseum, and what's in it changes with every round (the
// room's "mode"): nothing at all, blocks for cover, blocks that slide back and
// forth, or a pit in the middle. The server lays each round out and tells the games,
// and lays it out again every 45 seconds while the round's on ("layout", with a few
// seconds' warning before it comes in).
//
// Empty seats are filled by bots so the room is never empty. A bot is a runner
// like any other; one of the players' games (the room's "host", the one that has
// been in longest) moves them. If that player leaves, the next one takes them over.
//
// Control messages are JSON text. Runner states are binary, relayed as sent:
// byte 0 is the packet kind, then 11 bytes a runner (id, flags, x, y, z, heading,
// speed); a game may only send states for runners it owns.
// Rooms live in memory only.

import { cleanName } from '../eightBitEvilV2/rooms.js';

export const RADIUS = 70; // the arena is round: this many metres from the middle to the wall
export const HALF = RADIUS; // (what the first build of the game calls it)
export const MODES = ['open', 'blocks', 'movers', 'pit'];
export const PIT_RADIUS = 14;
export const LAYOUT_MS = 45_000; // between changes of layout while a round's on
export const WARN_MS = 3_500; // how long the games are told before one comes in
export const MAX_HUMANS = 8;
export const FILL_TO = 6; // bots make the room up to this many runners
export const START_MASS = 10;
export const ROUND_MS = 180_000;
export const OVER_MS = 9_000; // the standings, between rounds
export const SAFE_MS = 2_500; // a runner just (re)spawned can't hit or be hit
export const DROPS = 110;
export const K_STATE = 1;
export const STATE_BYTES = 11;
const MAX_ROOMS = 40;
const HIT_REACH = 14; // metres apart, by their last states, two runners can be for a hit to count
const KILL_BONUS = 5;
const KILL_SHARE = 0.25; // of the burst runner's mass, to whoever burst it
const SPILL_SHARE = 0.6; // of it, back on the floor as drops
const DEAD_MS = 1_500; // the least a burst runner stays down
const LIMITS = { packets: 40, bytes: 8_000, texts: 80 }; // per second, per socket
const OPEN = 1;
const BOT_NAMES = ['GALLIUM', 'COBALT', 'TUNGSTEN', 'OSMIUM', 'BISMUTH', 'IRIDIUM', 'NICKEL', 'ZINC', 'CHROMIUM', 'TITANIUM'];

const round2 = (n) => Math.round(n * 100) / 100;

export function createArenaManager({ log, now = () => Date.now(), random = Math.random, firstMode = null } = {}) {
    const rooms = new Set();
    const seats = new Map(); // socket -> { room, id, window, packets, bytes, texts }

    const send = (socket, message) => {
        if (socket?.readyState === OPEN) socket.send(JSON.stringify(message));
    };
    const broadcast = (room, message, except = null) => {
        const text = JSON.stringify(message);
        for (const socket of room.sockets) if (socket !== except && socket.readyState === OPEN) socket.send(text);
    };
    const between = (low, high) => low + random() * (high - low);
    const describe = (e) => ({ id: e.id, name: e.name, bot: e.bot, mass: e.mass, alive: e.alive, kills: e.kills });
    const dropList = (room) => [...room.drops].map(([id, d]) => [id, d.x, d.z, d.v]);
    const humans = (room) => room.sockets.size;
    const bots = (room) => [...room.ents.values()].filter((e) => e.bot);

    // Somewhere on the floor at least `margin` in from the wall (and clear of the pit)
    function spot(room, margin) {
        for (let tries = 0; tries < 40; tries += 1) {
            const angle = between(0, Math.PI * 2);
            const reach = Math.sqrt(random()) * (RADIUS - margin);
            if (reach > room.pit + 3 || room.pit === 0) return [Math.cos(angle) * reach, Math.sin(angle) * reach];
        }
        return [RADIUS * 0.5, 0];
    }

    // A round's layout, by its mode:
    //   blocks: the cover and the slabs to jump, [x, z, width, height, depth, turn, kind]
    //   movers: tall blocks that slide back and forth, broadside on, [x, z, width, height, depth, turn,
    //     travel x, travel z, seconds there and back, where in that it starts (0..1)]: at t
    //     seconds into the round one is at (x, z) + travel * sin(2 pi (t / seconds + start))
    //   pit: the radius of the hole in the middle (0: none)
    function layOut(room, mode) {
        room.mode = mode;
        room.blocks = [];
        room.movers = [];
        room.pit = mode === 'pit' ? PIT_RADIUS : 0;
        const blocks = { open: 0, blocks: 26, movers: 8, pit: 14 }[mode];
        let tries = 0;
        while (room.blocks.length < blocks && tries < 2000) {
            tries += 1;
            const [x, z] = spot(room, 9);
            if (room.blocks.some((b) => Math.hypot(b[0] - x, b[1] - z) < 11)) continue;
            if (room.blocks.length % 2 === 0) {
                room.blocks.push([round2(x), round2(z), round2(between(2, 5)), round2(between(2.5, 5)), round2(between(2, 5)), round2(between(0, Math.PI)), 0]);
            } else {
                room.blocks.push([round2(x), round2(z), round2(between(4, 8)), 0.7, round2(between(1, 2)), round2(between(0, Math.PI)), 1]);
            }
        }
        if (mode === 'movers') {
            for (let i = 0; i < 9; i += 1) {
                // Spread round the floor, each sliding along its own line through its middle
                const ring = between(0.25, 0.7) * RADIUS;
                const at = (i / 9) * Math.PI * 2 + between(-0.2, 0.2);
                const along = between(0, Math.PI);
                const travel = between(9, 16);
                room.movers.push([
                    round2(Math.cos(at) * ring), round2(Math.sin(at) * ring), round2(between(5, 9)), round2(between(3, 4.5)), round2(between(1.5, 2.5)),
                    round2(Math.PI / 2 - along), round2(Math.cos(along) * travel), round2(Math.sin(along) * travel), round2(between(5, 9)), round2(random()),
                ]);
            }
        }
    }

    // (t0: how far into the round this layout came in; its sliding blocks count from then)
    const layout = (room) => ({ mode: room.mode, radius: RADIUS, half: HALF, blocks: room.blocks, movers: room.movers, pit: room.pit, t0: room.layoutFrom ?? 0 });

    function ringPitDrops(room) {
        for (let i = 0; room.pit > 0 && i < 12; i += 1) {
            const angle = (i / 12) * Math.PI * 2;
            addDrop(room, Math.cos(angle) * (room.pit + 2.6), Math.sin(angle) * (room.pit + 2.6), 3);
        }
    }
    const inBlock = (room, x, z) => Math.hypot(x, z) < room.pit + 2.5
        || room.blocks.some((b) => Math.hypot(b[0] - x, b[1] - z) < Math.max(b[2], b[4]) * 0.75 + 1.2);

    function addDrop(room, x, z, v) {
        const id = room.nextDrop;
        room.nextDrop = (room.nextDrop % 60000) + 1;
        const drop = { x: round2(x), z: round2(z), v };
        room.drops.set(id, drop);
        return [id, drop.x, drop.z, v];
    }

    // One more drop somewhere clear on the floor
    function scatterDrop(room) {
        for (let tries = 0; tries < 8; tries += 1) {
            const [x, z] = spot(room, 3);
            if (!inBlock(room, x, z)) return addDrop(room, x, z, 1);
        }
        return null;
    }

    // A round's drops: scattered, and round a pit a ring of fat ones on its lip
    function layDrops(room) {
        room.drops.clear();
        for (let i = 0; i < DROPS; i += 1) scatterDrop(room);
        ringPitDrops(room);
    }

    function newRoom() {
        const room = {
            ents: new Map(), sockets: new Set(), drops: new Map(), nextDrop: 1,
            phase: 'play', until: now() + ROUND_MS, host: null, botNames: 0,
            nextLayout: now() + LAYOUT_MS, layoutFrom: 0,
        };
        layOut(room, firstMode ?? MODES[Math.floor(random() * MODES.length)]);
        layDrops(room);
        rooms.add(room);
        return room;
    }

    function addEnt(room, { name, bot, owner }) {
        let id = 1;
        while (room.ents.has(id)) id += 1;
        const ent = { id, name, bot, owner, mass: START_MASS, alive: true, kills: 0, x: 0, z: 0, placed: false, safeUntil: now() + SAFE_MS, diedAt: 0 };
        room.ents.set(id, ent);
        return ent;
    }

    // Bots fill the seats players haven't; the host's game runs them all
    function balanceBots(room) {
        const want = humans(room) === 0 ? 0 : Math.max(0, FILL_TO - humans(room));
        let have = bots(room);
        while (have.length > want) {
            const out = have.reduce((a, b) => (b.mass < a.mass ? b : a));
            room.ents.delete(out.id);
            broadcast(room, { t: 'gone', id: out.id });
            have = bots(room);
        }
        while (have.length < want) {
            const taken = new Set(have.map((e) => e.name));
            let name = BOT_NAMES[room.botNames % BOT_NAMES.length];
            for (let i = 0; i < BOT_NAMES.length && taken.has(name); i += 1) {
                room.botNames += 1;
                name = BOT_NAMES[room.botNames % BOT_NAMES.length];
            }
            room.botNames += 1;
            const bot = addEnt(room, { name, bot: true, owner: room.host });
            broadcast(room, { t: 'ent', ...describe(bot) });
            have = bots(room);
        }
        for (const bot of have) bot.owner = room.host;
        if (room.sockets.has(room.host)) send(room.host, { t: 'bots', ids: have.map((e) => e.id) });
    }

    function join(socket, message = {}) {
        if (seats.has(socket)) leave(socket);
        let room = null;
        for (const r of rooms) if (humans(r) < MAX_HUMANS && (!room || humans(r) > humans(room))) room = r;
        if (!room) {
            if (rooms.size >= MAX_ROOMS) {
                send(socket, { t: 'full' });
                return null;
            }
            room = newRoom();
        }
        const ent = addEnt(room, { name: cleanName(message.name, 'RUNNER'), bot: false, owner: socket });
        broadcast(room, { t: 'ent', ...describe(ent) });
        if (!room.host) room.host = socket;
        room.sockets.add(socket);
        seats.set(socket, { room, id: ent.id, window: now(), packets: 0, bytes: 0, texts: 0 });
        send(socket, {
            t: 'welcome', you: ent.id, ...layout(room), drops: dropList(room),
            ents: [...room.ents.values()].map(describe), phase: room.phase, ends: Math.max(0, room.until - now()),
            // (how far into the round it is: the sliding blocks are placed by it)
            at: room.phase === 'play' ? Math.max(0, ROUND_MS - (room.until - now())) : 0,
            safe: SAFE_MS,
        });
        balanceBots(room);
        return room;
    }

    function leave(socket) {
        const at = seats.get(socket);
        if (!at) return;
        seats.delete(socket);
        const { room, id } = at;
        room.sockets.delete(socket);
        room.ents.delete(id);
        if (room.sockets.size === 0) {
            rooms.delete(room);
            return;
        }
        broadcast(room, { t: 'gone', id });
        if (room.host === socket) room.host = room.sockets.values().next().value;
        balanceBots(room);
    }

    // A runner this socket may speak for: its own, or (the host) a bot
    const owned = (at, id) => {
        const ent = at.room.ents.get(Number(id));
        return ent && ent.owner === at.socket ? ent : null;
    };

    function kill(room, victim, by, how) {
        const lost = victim.mass;
        victim.alive = false;
        victim.mass = 0;
        victim.diedAt = now();
        const spill = Math.max(3, Math.floor(lost * SPILL_SHARE));
        const pieces = Math.min(14, Math.max(3, Math.ceil(spill / 6)));
        const drops = [];
        let left = spill;
        for (let i = 0; i < pieces; i += 1) {
            const value = i === pieces - 1 ? left : Math.max(1, Math.round(spill / pieces));
            if (value <= 0) break;
            left -= value;
            const angle = between(0, Math.PI * 2);
            const reach = between(1.5, 5);
            let x = victim.x + Math.cos(angle) * reach;
            let z = victim.z + Math.sin(angle) * reach;
            const out = Math.hypot(x, z);
            if (out > RADIUS - 2) {
                x *= (RADIUS - 2) / out;
                z *= (RADIUS - 2) / out;
            }
            if (inBlock(room, x, z)) {
                x = victim.x; // (it got there, so a drop there can be reached)
                z = victim.z;
            }
            if (Math.hypot(x, z) < room.pit + 2.5) {
                // Lost down the pit: its drops land on the lip, out the way it came
                const way = Math.atan2(victim.z, victim.x) + between(-0.5, 0.5);
                x = Math.cos(way) * (room.pit + between(2.6, 5));
                z = Math.sin(way) * (room.pit + between(2.6, 5));
            }
            drops.push(addDrop(room, x, z, value));
        }
        if (by) {
            by.mass += KILL_BONUS + Math.floor(lost * KILL_SHARE);
            by.kills += 1;
        }
        broadcast(room, { t: 'kill', a: by?.id ?? 0, v: victim.id, am: by?.mass ?? 0, how, lost, drops });
    }

    function message(socket, m = {}) {
        const seat = seats.get(socket);
        if (m.t === 'join') {
            join(socket, m);
            return;
        }
        if (!seat || !allow(seat, 0)) return;
        const at = { room: seat.room, socket };
        const { room } = seat;
        const t = now();
        switch (m.t) {
            case 'take': {
                const ent = owned(at, m.e);
                const drop = room.drops.get(Number(m.d));
                if (!ent || !ent.alive || !drop || room.phase !== 'play') return;
                room.drops.delete(Number(m.d));
                ent.mass += drop.v;
                broadcast(room, { t: 'took', e: ent.id, d: Number(m.d), m: ent.mass });
                break;
            }
            case 'hit': {
                const a = owned(at, m.a);
                const v = room.ents.get(Number(m.v));
                if (!a || !v || a === v || !a.alive || !v.alive || room.phase !== 'play') return;
                if (t < a.safeUntil || t < v.safeUntil) return;
                if (a.placed && v.placed && Math.hypot(a.x - v.x, a.z - v.z) > HIT_REACH) return;
                kill(room, v, a, m.how === 'eat' ? 'eat' : 'dash');
                break;
            }
            case 'died': {
                // Ran into a wall (or off into the pit)
                const ent = owned(at, m.e);
                if (!ent || !ent.alive || room.phase !== 'play') return;
                // (into the wall of metal another runner's dash left standing: theirs the credit)
                const by = m.how === 'trail' ? room.ents.get(Number(m.by)) : null;
                if (by && by.alive && by !== ent) {
                    if (t >= ent.safeUntil) kill(room, ent, by, 'trail');
                    return;
                }
                kill(room, ent, null, m.how === 'pit' ? 'pit' : 'wall');
                break;
            }
            case 'spawn': {
                const ent = owned(at, m.e);
                if (!ent || ent.alive || t - ent.diedAt < DEAD_MS) return;
                ent.alive = true;
                ent.mass = START_MASS;
                ent.placed = false;
                ent.safeUntil = t + SAFE_MS;
                broadcast(room, { t: 'alive', e: ent.id, m: ent.mass });
                break;
            }
            case 'leave':
                leave(socket);
                break;
            default:
                break;
        }
    }

    // The per-second allowance; bytes > 0 is a state packet, 0 a text message
    function allow(seat, bytes) {
        const t = now();
        if (t - seat.window >= 1000) {
            seat.window = t;
            seat.packets = 0;
            seat.bytes = 0;
            seat.texts = 0;
        }
        if (bytes === 0) {
            seat.texts += 1;
            return seat.texts <= LIMITS.texts;
        }
        seat.packets += 1;
        seat.bytes += bytes;
        return seat.packets <= LIMITS.packets && seat.bytes <= LIMITS.bytes;
    }

    // A packet of runner states. Returns false if it was dropped.
    function relay(socket, data) {
        const seat = seats.get(socket);
        if (!seat || data.length < 1 + STATE_BYTES || data[0] !== K_STATE || (data.length - 1) % STATE_BYTES !== 0) return false;
        if (!allow(seat, data.length)) return false;
        const { room } = seat;
        const buffer = Buffer.from(data);
        for (let at = 1; at < buffer.length; at += STATE_BYTES) {
            const ent = room.ents.get(buffer[at]);
            if (!ent || ent.owner !== socket) return false;
            ent.x = buffer.readInt16LE(at + 2) / 100;
            ent.z = buffer.readInt16LE(at + 6) / 100;
            ent.placed = true;
        }
        for (const other of room.sockets) {
            if (other !== socket && other.readyState === OPEN) other.send(buffer, { binary: true });
        }
        return true;
    }

    const standings = (room) => [...room.ents.values()].sort((a, b) => b.mass - a.mass).map(describe);

    // The round clock, and drops trickling back onto the floor
    function tick() {
        const t = now();
        for (const room of rooms) {
            if (room.phase === 'play') {
                if (t >= room.until) {
                    room.phase = 'over';
                    room.until = t + OVER_MS;
                    broadcast(room, { t: 'over', top: standings(room), next: OVER_MS });
                    continue;
                }
                if (t >= room.nextLayout && room.until - t > 20_000) {
                    // The arena changes under them: a warning now, the new layout in a moment
                    room.nextLayout = t + LAYOUT_MS;
                    const modes = MODES.filter((mode) => mode !== room.mode);
                    layOut(room, modes[Math.floor(random() * modes.length)]);
                    room.layoutFrom = ROUND_MS - (room.until - t) + WARN_MS;
                    for (const [id, drop] of room.drops) {
                        if (inBlock(room, drop.x, drop.z)) room.drops.delete(id); // (a stone or the pit is coming there)
                    }
                    ringPitDrops(room);
                    broadcast(room, { t: 'layout', ...layout(room), in: WARN_MS, drops: dropList(room) });
                    continue;
                }
                const fresh = [];
                for (let i = 0; i < 4 && room.drops.size < DROPS; i += 1) {
                    const drop = scatterDrop(room);
                    if (drop) fresh.push(drop);
                }
                if (fresh.length > 0) broadcast(room, { t: 'drops', list: fresh });
            } else if (t >= room.until) {
                // A new round: everyone back to the start, and the arena laid out another way
                room.phase = 'play';
                room.until = t + ROUND_MS;
                room.nextLayout = t + LAYOUT_MS;
                room.layoutFrom = 0;
                const others = MODES.filter((mode) => mode !== room.mode);
                layOut(room, others[Math.floor(random() * others.length)]);
                layDrops(room);
                for (const ent of room.ents.values()) {
                    ent.mass = START_MASS;
                    ent.alive = true;
                    ent.kills = 0;
                    ent.placed = false;
                    ent.safeUntil = t + SAFE_MS;
                }
                broadcast(room, { t: 'round', ends: ROUND_MS, ...layout(room), drops: dropList(room), ents: [...room.ents.values()].map(describe) });
            }
        }
    }

    function close() {
        rooms.clear();
        seats.clear();
    }

    log?.debug?.('Liquid Metal arena ready');
    return { join, leave, disconnect: leave, message, relay, tick, close, size: () => rooms.size, rooms: () => [...rooms] };
}
