// Hippo Rapids: the river course and the raft physics, shared by the server (which runs
// every online room) and the client (which runs solo games and draws everything).
//
// The raft is a disc on a river that flows toward +z. Each hippo sits on the rim at an
// angle `ang` (relative to the raft) with its tail pointing outward; a fart shoves the raft
// the opposite way, straight through its middle. Angles follow Three.js' rotation.y: angle
// 0 points at +z and angle PI/2 at +x, so a hippo at world angle a has its tail toward
// (sin a, cos a) and pushes the raft toward (-sin a, -cos a).
//
// Everything that moves on its own (sweepers, logs) is a pure function of the sim clock
// `t`, so a snapshot only has to carry the raft and the hippos.

import { GEYSER_BLAST, GEYSER_WARN, SEG, buildCourse, clamp, geyserAt, gustAt, logAt, sanitizeLevel, smooth, spinnerBars, sweeperEnds } from './course.js';
import { LEVELS, getLevel } from './levels.js';

export { GEYSER_BLAST, GEYSER_WARN, LEVELS, getLevel, geyserAt, gustAt, logAt, sanitizeLevel, spinnerBars, sweeperEnds };
export { ITEM_TYPES } from './course.js';

export const STEP = 1 / 60;
export const MAX_HULL = 5;
export const COUNTDOWN = 3.5;
export const SINK_TIME = 2.6;
export const RIM_SPEED = 1.7;
export const GAS_DRAIN = 0.42;
export const GAS_REGEN = 0.3;
export const GAS_RESTART = 0.15;
export const HIPPO_NAMES = ['Hyuk', 'Bubbles', 'Gus', 'Petunia'];
export const SEAT_COUNTS = [1, 2, 4];
// Each ring the raft passes through takes this many seconds off the time that counts.
export const RING_BONUS = 1;
// A toot builds up over this long, so a tap is a nudge and a held toot is a shove.
const TOOT_RAMP = 0.22;
// How hard a headwind pulls back. The hippos crowd the back of the raft and push at an angle,
// so a crew gets less out of its farts than the sum: a whole crew (all of two, three of four) is
// what it takes.
const windPull = (count, need) => Math.max(0, THRUST[count] * (Math.min(need, count === 1 ? 1 : count === 2 ? 2 : 3) - (count === 1 ? 0.5 : count === 2 ? 1.2 : 1.5)));
// A lock gate listens for farts this far upriver of it.
export const COOP_SPAN = 18;
// Taps count as together if they start this close.
const TAP_WINDOW = 0.35;

const DRAG = 1.15;
const SPIN_DRAG = 1.4;
const BOUNCE = 0.5;
const INVULN = 1.4;
// One hippo on a little raft with a bigger tank of beans and a harder push: a solo game.
const RAFT_RADIUS = { 1: 1.5, 2: 1.9, 4: 2.45 };
const THRUST = { 1: 4.9, 2: 4.4, 4: 3.7 };
const GAS_USE = { 1: 0.3, 2: GAS_DRAIN, 4: GAS_DRAIN };

export const wrapAngle = (a) => {
    const t = (a + Math.PI) % (Math.PI * 2);
    return (t < 0 ? t + Math.PI * 2 : t) - Math.PI;
};

function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export const raftRadius = (seats) => RAFT_RADIUS[seats] ?? RAFT_RADIUS[4];
// How far from the raft's middle the hippos sit.
export const seatRadius = (seats) => raftRadius(seats) - 0.7;

// A level can be a built-in's id, a level (as saved by the editor) or an already built course.
export function getCourse(level = 'whole') {
    if (level && typeof level === 'object' && level.centerX) return level;
    const def = typeof level === 'string' ? getLevel(level)?.def : sanitizeLevel(level);
    return buildCourse(def ?? getLevel('whole').def);
}

export function createSim({ seats = 4, skill = 0.55, seed = 1, level = 'whole' } = {}) {
    const count = seats === 1 ? 1 : seats === 2 ? 2 : 4;
    const course = getCourse(level);
    const CHECKPOINTS = course.checkpoints;
    const R = raftRadius(count);
    const seatR = seatRadius(count);
    const minGap = (count === 2 ? 1.2 : 0.8);
    const rng = mulberry32(seed * 7919 + 13);
    const sim = {
        seats: count,
        R,
        seatR,
        course,
        t: 0,
        phase: 'countdown',
        countdown: COUNTDOWN,
        run: 0,
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        yaw: 0,
        w: 0,
        hull: MAX_HULL,
        inv: 0,
        sunk: 0,
        cp: -1,
        sinks: 0,
        hits: 0,
        rings: new Set(),
        gates: course.gates.map(() => ({ open: false, charge: 0, taps: 0, win: -9, starts: 0, mask: 0, last: -9 })),
        events: [],
        stuck: 0,
        hippos: Array.from({ length: count }, (_, i) => ({
            ang: (i / count) * Math.PI * 2 + Math.PI,
            mv: 0,
            fart: false,
            pw: 0,
            was: false,
            started: false,
            home: 0,
            gas: 1,
            spent: false,
            bot: true,
            skill,
            brain: { next: 0, ax: 0, az: 0, drift: 0 },
        })),
    };
    // Seat 0 starts at the back so the first push goes forward.
    sim.hippos.forEach((h, i) => {
        h.ang = Math.PI + (i / count) * Math.PI * 2;
        h.home = h.ang;
    });

    const emit = (e) => sim.events.push(e);

    sim.setInput = (seat, mv, fart) => {
        const h = sim.hippos[seat];
        if (!h) return;
        h.mv = mv > 0 ? 1 : mv < 0 ? -1 : 0;
        h.fart = !!fart;
    };

    sim.respawn = () => {
        const z = sim.cp >= 0 ? CHECKPOINTS[sim.cp] : 0;
        sim.x = course.centerX(z);
        sim.z = z;
        sim.vx = sim.vz = sim.w = 0;
        sim.yaw = 0;
        sim.hull = MAX_HULL;
        sim.inv = 2;
        sim.sunk = 0;
        for (const h of sim.hippos) h.gas = 1;
        emit({ e: 'respawn' });
    };

    // Raft against something: n points from the obstacle toward the raft's middle. (ox, oz)
    // is how fast the obstacle itself is moving there.
    const bump = (nx, nz, depth, ox, oz, hazard, bounce = BOUNCE) => {
        sim.x += nx * depth;
        sim.z += nz * depth;
        const vn = (sim.vx - ox) * nx + (sim.vz - oz) * nz;
        if (vn >= 0) return;
        const jn = (1 + bounce) * -vn;
        sim.vx += nx * jn;
        sim.vz += nz * jn;
        // Scraping spins the raft: the contact point drags along the obstacle.
        const tx = -nz;
        const tz = nx;
        const vt = (sim.vx - ox) * tx + (sim.vz - oz) * tz + sim.w * R;
        const jt = clamp(-vt / 3, -0.5 * jn, 0.5 * jn);
        sim.vx += tx * jt;
        sim.vz += tz * jt;
        sim.w += (2 * jt) / R;
        const speed = -vn;
        if (hazard && sim.inv <= 0 && sim.phase === 'run' && sim.sunk <= 0) {
            sim.hull -= 1;
            sim.hits += 1;
            sim.inv = INVULN;
            emit({ e: 'hit', x: sim.x - nx * R, z: sim.z - nz * R });
            if (sim.hull <= 0) {
                sim.sunk = SINK_TIME;
                sim.sinks += 1;
                emit({ e: 'sink' });
            }
        } else if (speed > 0.8) {
            emit({ e: 'bump', s: Math.min(1, speed / 6) });
        }
    };

    const bumpPoint = (px, pz, r, ox, oz, hazard, bounce) => {
        const dx = sim.x - px;
        const dz = sim.z - pz;
        const min = R + r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) return;
        const d = Math.sqrt(d2) || 0.001;
        bump(dx / d, dz / d, min - d, ox, oz, hazard, bounce);
    };

    // Raft against a line segment (a wall, a sweeper, a log) of the given thickness.
    const bumpSegment = (ax, az, bx, bz, r, vax, vaz, vbx, vbz, hazard) => {
        const sx = bx - ax;
        const sz = bz - az;
        const len2 = sx * sx + sz * sz || 1;
        const u = clamp(((sim.x - ax) * sx + (sim.z - az) * sz) / len2, 0, 1);
        bumpPoint(ax + sx * u, az + sz * u, r, vax + (vbx - vax) * u, vaz + (vbz - vaz) * u, hazard);
    };

    const collide = () => {
        const i = Math.floor((sim.z + 60) / SEG);
        for (let k = i - 1; k <= i + 1; k++) {
            const pair = course.walls[k];
            if (!pair) continue;
            for (const [ax, az, bx, bz] of pair) bumpSegment(ax, az, bx, bz, 0, 0, 0, 0, 0, false);
        }
        for (const o of course.statics) {
            if (Math.abs(o.z - sim.z) < 6) bumpPoint(o.x, o.z, o.r, 0, 0, o.hazard);
        }
        for (const s of course.sweepers) {
            if (Math.abs(s.z - sim.z) > s.len + R + 1) continue;
            const [ax, az, bx, bz] = sweeperEnds(s, sim.t);
            const a = s.phase + s.speed * sim.t;
            const tipSpeed = s.speed * s.len;
            bumpSegment(ax, az, bx, bz, 0.5, 0, 0, Math.cos(a) * tipSpeed, -Math.sin(a) * tipSpeed, true);
        }
        for (const l of course.logs) {
            if (Math.abs(l.z - sim.z) > 6) continue;
            const { x, vx } = logAt(l, sim.t);
            bumpSegment(x - l.half, l.z, x + l.half, l.z, l.r, vx, 0, vx, 0, false);
        }
        for (const g of course.gators) {
            if (Math.abs(g.z - sim.z) > 6) continue;
            const { x, vx } = logAt(g, sim.t);
            bumpSegment(x - g.half, g.z, x + g.half, g.z, g.r, vx, 0, vx, 0, true);
        }
        course.gates.forEach((g, i) => {
            if (!sim.gates[i].open && Math.abs(g.z - sim.z) < 6) bumpSegment(g.x - g.hw - 4, g.z, g.x + g.hw + 4, g.z, 0.7, 0, 0, 0, 0, false);
        });
        for (const n of course.needles) {
            if (sim.z < n.z - 9 || sim.z > n.z + n.len + 4) continue;
            // Spiked rails with a flared mouth: the mouth only guides, the channel hurts.
            const gap = R + n.slack + 0.45;
            for (const sd of [-1, 1]) {
                bumpSegment(n.x + sd * gap, n.z, n.x + sd * gap, n.z + n.len, 0.45, 0, 0, 0, 0, true);
                bumpSegment(n.x + sd * (gap + 4), n.z - 8, n.x + sd * gap, n.z, 0.35, 0, 0, 0, 0, false);
            }
        }
        for (const b of course.bumpers) {
            if (Math.abs(b.z - sim.z) < 6) bumpPoint(b.x, b.z, b.r, 0, 0, false, 1.6);
        }
        for (const s of course.spinners) {
            if (Math.abs(s.z - sim.z) > s.len + R + 1) continue;
            bumpPoint(s.x, s.z, 0.8, 0, 0, false);
            for (const { ends, va, vb } of spinnerBars(s, sim.t)) bumpSegment(ends[0], ends[1], ends[2], ends[3], 0.4, va[0], va[1], vb[0], vb[1], !!s.hazard);
        }
    };

    const crew = (dt) => {
        const racing = sim.phase === 'run' && sim.sunk <= 0;
        let fx = 0;
        let fz = 0;
        for (const h of sim.hippos) {
            h.ang = wrapAngle(h.ang + h.mv * RIM_SPEED * dt);
            const farting = racing && h.fart && h.gas > 0 && !h.spent;
            h.live = farting;
            h.started = farting && !h.was;
            h.was = farting;
            h.pw = farting ? Math.min(1, h.pw + dt / TOOT_RAMP) : Math.max(0, h.pw - dt / 0.1);
            if (farting) {
                h.gas = Math.max(0, h.gas - GAS_USE[count] * dt);
                if (h.gas <= 0) h.spent = true;
                const a = sim.yaw + h.ang;
                fx -= Math.sin(a) * THRUST[count] * h.pw;
                fz -= Math.cos(a) * THRUST[count] * h.pw;
            } else {
                h.gas = Math.min(1, h.gas + GAS_REGEN * dt);
                if (h.spent && h.gas >= GAS_RESTART) h.spent = false;
            }
        }
        // Hippos can't pass through each other: a hippo walking into another shoves it along.
        for (let pass = 0; pass < 6; pass++) {
            for (let i = 0; i < count; i++) {
                for (let j = i + 1; j < count; j++) {
                    const a = sim.hippos[i];
                    const b = sim.hippos[j];
                    const d = wrapAngle(b.ang - a.ang);
                    if (Math.abs(d) >= minGap) continue;
                    const push = (minGap - Math.abs(d)) / 2;
                    const dir = d >= 0 ? 1 : -1;
                    a.ang = wrapAngle(a.ang - dir * push);
                    b.ang = wrapAngle(b.ang + dir * push);
                }
            }
        }
        return [fx, fz];
    };

    // Lock gates: open when enough hippos fart together (held for a while, or in unison taps).
    function updateGates(dt) {
        if (sim.phase !== 'run') return;
        course.gates.forEach((g, i) => {
            const st = sim.gates[i];
            if (st.open) return;
            const need = Math.min(g.need, count);
            const near = sim.z > g.z - COOP_SPAN && sim.z < g.z + 4;
            if (g.mode === 0) {
                const live = sim.hippos.filter((h) => h.live).length;
                st.charge = near && live >= need ? st.charge + dt / g.hold : Math.max(0, st.charge - dt * 0.6);
            } else {
                if (st.taps > 0 && sim.t - st.last > 6) st.taps = 0;
                if (near) {
                    sim.hippos.forEach((h, k) => {
                        if (!h.started) return;
                        if (sim.t - st.win > TAP_WINDOW) {
                            st.win = sim.t;
                            st.mask = 0;
                        }
                        st.mask |= 1 << k;
                    });
                    let n = 0;
                    for (let k = 0; k < count; k++) if (st.mask & (1 << k)) n++;
                    if (n >= need && sim.t - st.win <= TAP_WINDOW && sim.t - st.last > 0.45) {
                        st.taps += 1;
                        st.last = sim.t;
                        st.mask = 0;
                        st.win = -9;
                        emit({ e: 'gate', i, k: 'tap' });
                    }
                }
                st.charge = Math.min(1, st.taps / g.count);
                if (st.taps >= g.count) st.charge = 1;
            }
            if (st.charge >= 1) {
                st.open = true;
                emit({ e: 'gate', i, k: 'open' });
            }
        });
    }

    sim.step = (dt = STEP) => {
        sim.t += dt;
        if (sim.inv > 0) sim.inv -= dt;
        if (sim.phase === 'countdown') {
            sim.countdown -= dt;
            if (sim.countdown <= 0) {
                sim.phase = 'run';
                emit({ e: 'go' });
            }
        } else if (sim.phase === 'run') {
            sim.run += dt;
        }
        // Wedged against something for a while: the bots back out.
        sim.stuck = sim.phase === 'run' && Math.hypot(sim.vx, sim.vz) < 0.5 ? sim.stuck + dt : 0;
        for (let i = 0; i < count; i++) if (sim.hippos[i].bot) botDrive(sim, i, dt, rng);

        if (sim.sunk > 0) {
            sim.sunk -= dt;
            sim.vx *= 1 - dt;
            sim.vz *= 1 - dt;
            sim.x += sim.vx * dt;
            sim.z += sim.vz * dt;
            for (const h of sim.hippos) h.fart = false;
            crew(dt);
            if (sim.sunk <= 0) sim.respawn();
            return;
        }

        const [fx0, fz0] = crew(dt);
        let fz = fz0;
        // Headwind: only enough hippos pushing at once make any headway through it.
        for (const w of course.headwinds) {
            if (sim.z >= w.z && sim.z <= w.z + w.len) fz -= windPull(count, w.need);
        }
        let fx = fx0;
        for (const g of course.gusts) if (sim.z >= g.z && sim.z <= g.z + g.len) fx += gustAt(g, sim.t) * THRUST[count];
        updateGates(dt);
        const [cx, cz] = course.flowAt(sim.x, sim.z);
        // The pads in Hippo Falls give a shove downstream.
        let pad = 0;
        for (const b of course.boosts) {
            if (Math.hypot(sim.x - b.x, sim.z - b.z) < b.r + R * 0.5) pad = 9;
        }
        if (pad && sim.phase === 'run') emit({ e: 'boost' });
        const done = sim.phase === 'done';
        // Lily pads gum the raft up; geysers blast it away from the vent.
        let gum = 1;
        for (const l of course.lily) if (Math.hypot(sim.x - l.x, sim.z - l.z) < l.r + R * 0.3) gum = 3;
        for (const g of course.geysers) {
            if (Math.abs(g.z - sim.z) > g.r + R + 1 || geyserAt(g, sim.t).state !== 'erupt') continue;
            const gx = sim.x - g.x;
            const gz = sim.z - g.z;
            const gd = Math.hypot(gx, gz);
            const reach = g.r + R * 0.5;
            if (gd >= reach) continue;
            const push = 30 * (1 - (gd / reach) * 0.6);
            sim.vx += ((gd > 0.05 ? gx / gd : 1) * push) * dt;
            sim.vz += ((gd > 0.05 ? gz / gd : 0) * push) * dt;
            sim.w += (gx > 0 ? -1 : 1) * 1.2 * dt;
        }
        const drag = (done ? DRAG * 2.2 : DRAG) * gum;
        sim.vx += (fx - (sim.vx - cx) * drag) * dt;
        sim.vz += (fz + pad - (sim.vz - cz) * drag) * dt;
        // The vortex twists the raft too.
        if (course.vortex) {
            const d = Math.hypot(sim.x - course.vortex.x, sim.z - course.vortex.z);
            if (d < course.vortex.r) sim.w += 0.35 * smooth(1 - d / course.vortex.r) * dt;
        }
        sim.w -= sim.w * SPIN_DRAG * dt;
        sim.yaw = wrapAngle(sim.yaw + sim.w * dt);
        sim.x += sim.vx * dt;
        sim.z += sim.vz * dt;
        collide();
        // Never leave the river, whatever the speed.
        const lim = course.halfWidth(sim.z) - R * 0.6;
        const mid = course.centerX(sim.z);
        if (Math.abs(sim.x - mid) > lim + R) {
            sim.x = mid + Math.sign(sim.x - mid) * lim;
            sim.vx = 0;
        }

        // Checkpoints and the finish.
        for (let i = sim.cp + 1; i < CHECKPOINTS.length; i++) {
            if (sim.z >= CHECKPOINTS[i]) {
                sim.cp = i;
                emit({ e: 'cp', i });
            }
        }
        if (sim.phase === 'run') {
            course.rings.forEach((r, i) => {
                if (!sim.rings.has(i) && Math.abs(r.z - sim.z) < 4 && Math.hypot(r.x - sim.x, r.z - sim.z) < r.r) {
                    sim.rings.add(i);
                    emit({ e: 'ring', i });
                }
            });
        }
        if (sim.phase === 'run' && sim.z >= course.finishZ) {
            sim.phase = 'done';
            emit({ e: 'finish' });
        }
    };

    // The state a client needs to draw the raft, small enough to send twenty times a second.
    const r2 = (n) => Math.round(n * 100) / 100;
    sim.snapshot = () => {
        const events = sim.events;
        sim.events = [];
        return {
            t: r2(sim.t),
            ph: sim.phase,
            cd: r2(Math.max(0, sim.countdown)),
            run: r2(sim.run),
            x: r2(sim.x),
            z: r2(sim.z),
            yaw: r2(sim.yaw),
            vx: r2(sim.vx),
            vz: r2(sim.vz),
            w: r2(sim.w),
            hull: sim.hull,
            inv: sim.inv > 0,
            sunk: r2(Math.max(0, sim.sunk)),
            cp: sim.cp,
            sinks: sim.sinks,
            hits: sim.hits,
            rg: [...sim.rings],
            gt: sim.gates.map((g) => [g.open ? 1 : 0, r2(g.charge), g.taps]),
            h: sim.hippos.map((h) => [r2(h.ang), h.live ? 1 : 0, r2(h.gas), h.spent ? 1 : 0, h.mv, h.bot ? 1 : 0]),
            ev: events,
        };
    };

    sim.reset = () => {
        sim.t = 0;
        sim.phase = 'countdown';
        sim.countdown = COUNTDOWN;
        sim.run = 0;
        sim.cp = -1;
        sim.sinks = 0;
        sim.hits = 0;
        sim.rings.clear();
        sim.gates = course.gates.map(() => ({ open: false, charge: 0, taps: 0, win: -9, starts: 0, mask: 0, last: -9 }));
        sim.respawn();
        sim.inv = 0;
        sim.events = [];
    };

    return sim;
}

// A hippo that isn't being played. It reads the river ahead for a clear lane, works out
// which way the raft should be shoved, and walks round the rim to the spot that does it.
// It's slow to react and sometimes wrong, so a real player still matters.
function guidance(sim, rng, skill) {
    const { course, R } = sim;
    const speed = Math.hypot(sim.vx, sim.vz);
    const look = 13 + speed * 1.4;
    const zMid = sim.z + look * 0.5;
    const lim = course.halfWidth(zMid) - R - 0.7;
    const cx = course.centerX(zMid);
    const blockers = [];
    const eta = (z) => Math.max(0, (z - sim.z) / Math.max(2.5, speed));
    const consider = (x, z, r) => {
        if (z < sim.z - R || z > sim.z + look + 4) return;
        if (rng() < (1 - skill) * 0.9) return;
        blockers.push([x, z, r]);
    };
    for (const o of course.statics) consider(o.x, o.z, o.r);
    for (const b of course.bumpers) consider(b.x, b.z, b.r + 0.3);
    for (const g of course.geysers) consider(g.x, g.z, g.r * 0.8);
    for (const l of course.lily) consider(l.x, l.z, l.r * 0.55);
    for (const sp of course.spinners) {
        if (Math.abs(sp.z - sim.z) > sp.len + look) continue;
        for (const { ends } of spinnerBars(sp, sim.t + eta(sp.z))) for (let k = 0; k <= 4; k++) consider(ends[0] + ((ends[2] - ends[0]) * k) / 4, ends[1] + ((ends[3] - ends[1]) * k) / 4, 1.1);
    }
    for (const g of course.gators) {
        const { x } = logAt(g, sim.t + eta(g.z));
        for (let k = -1; k <= 1; k++) consider(x + k * g.half, g.z, g.r + 0.5);
    }
    for (const s of course.sweepers) {
        if (Math.abs(s.z - sim.z) > s.len + look) continue;
        const [ax, az, bx, bz] = sweeperEnds(s, sim.t + eta(s.z));
        for (let k = 0; k <= 4; k++) consider(ax + ((bx - ax) * k) / 4, az + ((bz - az) * k) / 4, 1.1);
    }
    for (const l of course.logs) {
        const { x } = logAt(l, sim.t + eta(l.z));
        for (let k = -2; k <= 2; k++) consider(x + (k * l.half) / 2, l.z, l.r + 0.3);
    }
    let best = 0;
    let bestCost = Infinity;
    for (let lx = -lim; lx <= lim + 1e-6; lx += 0.8) {
        const X = cx + lx;
        let cost = Math.abs(X - sim.x) * 0.1 + Math.abs(lx) * 0.02;
        for (const [ox, oz, or] of blockers) {
            const slack = Math.abs(X - ox) - (or + R + 0.5);
            if (slack < 0) cost += (6 - slack * 2) / (1 + Math.max(0, oz - sim.z) * 0.12);
        }
        if (cost < bestCost) {
            bestCost = cost;
            best = X;
        }
    }
    // Inside (or about to enter) a needle: hold its middle, slowly, with a short look-ahead so
    // sideways drift is corrected at once.
    const needle = course.needles.find((n) => sim.z > n.z - 12 && sim.z < n.z + n.len - 1);
    if (needle) best = needle.x;
    const tx = best - sim.x;
    const tz = needle ? Math.min(look, 7) : look;
    const len = Math.hypot(tx, tz);
    const vmax = needle ? 2.8 + skill * 0.8 : 3.8 + skill * 1.6;
    const vdx = (tx / len) * vmax;
    // A closed gate ahead: slow to a halt in front of it.
    let vdzCap = Infinity;
    course.gates.forEach((g, i) => {
        if (!sim.gates[i].open && g.z > sim.z - 1 && g.z - sim.z < look + 8) vdzCap = Math.min(vdzCap, Math.max(0, (g.z - R - 4 - sim.z) * 0.9));
    });
    const vdz = Math.min((tz / len) * vmax, vdzCap);
    const [fx, fz] = course.flowAt(sim.x, sim.z);
    // Counter the current's drift as well as chasing the wanted speed.
    let ax = vdx - sim.vx + fx * 0.2;
    let az = vdz - sim.vz + fz * 0.2;
    // Lean into a crosswind.
    for (const g of course.gusts) if (sim.z >= g.z - 2 && sim.z <= g.z + g.len) ax -= gustAt(g, sim.t) * 3 * (0.5 + skill * 0.5);
    if (sim.phase !== 'run') ax = az = 0;
    // Wedged: back out, with a sideways nudge toward the middle of the river.
    if (sim.stuck > 1.5) {
        // Slide off sideways from whatever's in front, with a little backing out.
        let near = null;
        let nd = Infinity;
        for (const o of sim.course.statics) {
            const d = Math.hypot(o.x - sim.x, o.z - sim.z) - o.r;
            if (d < nd) {
                nd = d;
                near = o;
            }
        }
        const dir = near && nd < R + 2 ? Math.sign(sim.x - near.x || 1) : Math.sign(sim.course.centerX(sim.z) - sim.x || 1);
        ax = dir * 6;
        az = near && nd < R + 2 ? -1.5 : -5;
    }
    const noise = (rng() - 0.5) * 0.8 * (1 - skill);
    const c = Math.cos(noise);
    const s = Math.sin(noise);
    return [ax * c - az * s, ax * s + az * c];
}

// The teamwork a bot is part of right now, if any: a gate to open or a headwind to climb. With
// people aboard only some bots join in, so the people are needed; a crew of bots all do.
function coopTask(sim, seat) {
    const count = sim.hippos.length;
    const humans = sim.hippos.some((h) => !h.bot);
    const { course, R } = sim;
    // At a gate only some bots sing when people are aboard, so the people are needed.
    if (!humans || count === 2 || seat % 2 === 0) {
        for (let i = 0; i < course.gates.length; i++) {
            const g = course.gates[i];
            if (sim.gates[i].open || sim.z > g.z + 4 || g.z - sim.z > COOP_SPAN) continue;
            // Wait until the raft has slowed up against the gate before singing.
            if (g.z - sim.z < R + 8 && Math.hypot(sim.vx, sim.vz) < 2.4) return { kind: 'gate', g };
        }
    }
    for (const w of course.headwinds) {
        if (sim.z > w.z - 22 && sim.z < w.z + w.len) return { kind: 'wind', w };
    }
    return null;
}

function botDrive(sim, seat, dt, rng) {
    const h = sim.hippos[seat];
    const b = h.brain;
    const task = coopTask(sim, seat);
    if (task) {
        const ready = h.gas > 0.9 || h.live;
        if (task.kind === 'gate') {
            // Spread evenly round the rim (opposite farts cancel, so the raft stays put), keeping
            // the order the hippos are already in: they can't walk through each other.
            const n = sim.hippos.length;
            const order = sim.hippos.map((_, k) => k).sort((a, c) => sim.hippos[a].ang - sim.hippos[c].ang);
            let sx = 0;
            let sz = 0;
            order.forEach((k, j) => {
                const off = sim.hippos[k].ang - (j * Math.PI * 2) / n;
                sx += Math.sin(off);
                sz += Math.cos(off);
            });
            const slot = Math.atan2(sx, sz) + (order.indexOf(seat) * Math.PI * 2) / n;
            const err = wrapAngle(slot - h.ang);
            h.mv = Math.abs(err) < 0.08 ? 0 : err > 0 ? 1 : -1;
            const aligned = Math.abs(err) < 0.2;
            h.fart = aligned && !h.spent && (task.g.mode === 1 ? sim.t % 1.1 < 0.12 : ready);
            return;
        }
        // Headwind: everyone to the back, and all push together once the raft reaches it.
        // Each takes its own spot across the back, so the pushes line up with the river.
        const back = Math.PI - sim.yaw;
        const mates = sim.hippos
            .map((o, k) => k)
            .filter((k) => sim.hippos[k].bot && coopTask(sim, k))
            .sort((a, c) => wrapAngle(sim.hippos[a].ang - back) - wrapAngle(sim.hippos[c].ang - back));
        const slot = mates.indexOf(seat) - (mates.length - 1) / 2;
        const gap = (sim.hippos.length === 2 ? 1.2 : 0.8) + 0.05;
        const err = wrapAngle(Math.PI - sim.yaw + slot * gap - h.ang);
        h.mv = Math.abs(err) < 0.08 ? 0 : err > 0 ? 1 : -1;
        // Run-up: one hippo in two pushes up to it while the rest save their beans; then everyone
        // lets go together at the foot of the climb.
        const toGo = task.w.z - sim.z;
        // Nobody pushes on the way up (saving the beans); everyone lets go together just short of
        // the climb, so the beans last through it.
        const go = task.w.z - sim.z < (sim.hippos.length === 2 ? 4 : 3.5);
        h.fart = Math.abs(err) < 0.9 && !h.spent && go;
        return;
    }
    b.next -= dt;
    if (b.next <= 0) {
        b.next = 0.18 + rng() * 0.2 + (1 - h.skill) * 0.25;
        [b.ax, b.az] = guidance(sim, rng, h.skill);
        b.drift = (rng() - 0.5) * 0.5 * (1 - h.skill);
    }
    const mag = Math.hypot(b.ax, b.az);
    if (mag < 0.7) {
        h.mv = 0;
        h.fart = false;
        b.err = Infinity;
        return;
    }
    // The tail has to point opposite the push.
    const want = Math.atan2(-b.ax, -b.az) - sim.yaw + b.drift;
    const err = wrapAngle(want - h.ang);
    const off = Math.abs(err);
    // A bot out of gas is last choice; one low on it is a worse choice than a fresh one.
    b.err = off + (h.spent ? 5 : (1 - h.gas) * 0.5);
    h.fart = off < 0.4 && !h.spent;
    // Only the bot best placed for the job walks round the rim; the rest hold their seats,
    // so a crowd of bots doesn't jam itself up.
    let driver = true;
    for (let i = 0; i < sim.hippos.length; i++) {
        const o = sim.hippos[i];
        if (i !== seat && o.bot && (o.brain.err ?? Infinity) < b.err) driver = false;
    }
    h.mv = driver && off > 0.08 ? (err > 0 ? 1 : -1) : 0;
}
