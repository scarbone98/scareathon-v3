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

export const STEP = 1 / 60;
export const COURSE_LENGTH = 722;
export const FINISH_Z = 718;
export const MAX_HULL = 5;
export const COUNTDOWN = 3.5;
export const SINK_TIME = 2.6;
export const RIM_SPEED = 1.7;
export const GAS_DRAIN = 0.42;
export const GAS_REGEN = 0.3;
export const GAS_RESTART = 0.15;
export const HIPPO_NAMES = ['Hyuk', 'Bubbles', 'Gus', 'Petunia'];
export const SEAT_COUNTS = [2, 4];

const DRAG = 1.15;
const SPIN_DRAG = 1.4;
const BOUNCE = 0.5;
const INVULN = 1.4;
const RAFT_RADIUS = { 2: 1.9, 4: 2.45 };
const THRUST = { 2: 4.4, 4: 3.7 };
const SEG = 5;

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
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

function interp(points, z) {
    if (z <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
        if (z <= points[i][0]) {
            const [z0, v0] = points[i - 1];
            const [z1, v1] = points[i];
            return v0 + (v1 - v0) * smooth((z - z0) / (z1 - z0));
        }
    }
    return points[points.length - 1][1];
}

const CENTER = [[-80, 0], [112, 0], [145, -7], [180, 7], [208, 0], [400, 0], [440, 8], [480, -8], [520, 0], [600, 0], [640, 6], [680, -6], [720, 0], [900, 0]];
const WIDTH = [[-80, 13], [40, 13], [90, 11.5], [290, 11.5], [330, 11], [440, 11], [470, 9.5], [520, 9.5], [545, 12.5], [560, 12], [665, 12], [678, 14.5], [692, 12], [900, 12]];
const FLOW = [[-80, 1], [440, 1.4], [455, 3], [515, 3.2], [535, 1.2], [900, 1.2]];

// Where the checkpoint flags stand: sinking sends the crew back to the last one reached.
export const CHECKPOINTS = [110, 200, 295, 385, 455, 525, 575, 650];
// What the player reads while rafting: the name of each stretch, by where it starts.
export const SECTIONS = [
    [-80, 'The Dock'],
    [40, 'Boulder Bend'],
    [195, 'Buoy Alley'],
    [295, 'The Sweepers'],
    [385, 'Log Jam'],
    [455, 'Hippo Falls'],
    [525, 'The Whirlpool'],
    [560, 'Geyser Gulch'],
    [640, 'Gator Marsh'],
];
const VORTEX = { z: 540, r: 17, strength: 2.4 };

export function sectionAt(z) {
    let name = SECTIONS[0][1];
    for (const [from, label] of SECTIONS) if (z >= from) name = label;
    return name;
}

const buildCourse = () => {
    const rng = mulberry32(1031);
    const centerX = (z) => interp(CENTER, z);
    const halfWidth = (z) => interp(WIDTH, z);
    const rocks = [];
    const mines = [];
    const sweepers = [];
    const logs = [];
    const boosts = [];
    const geysers = [];
    const lily = [];
    const bumpers = [];
    const gators = [];
    const spinners = [];

    // Boulders sit near the middle (never in a gap narrower than a raft against a bank),
    // so each one is a choice of left or right.
    const rock = (z, side, spread, r) => {
        const hw = halfWidth(z);
        rocks.push({ x: centerX(z) + side * Math.max(0.6, Math.min(hw * spread, hw - r - 7.4)), z, r });
    };

    // The dock and the first boulders: easy weaving.
    let side = 1;
    for (let z = 56; z <= 104; z += 12) {
        rock(z, side, 0.4 + rng() * 0.1, 1.2 + rng() * 0.7);
        side = -side;
    }
    // Boulder Bend: boulders on the outside of each turn, so cutting the corner is tempting.
    rock(134, 1, 0.5, 1.9);
    rock(156, -1, 0.5, 2.1);
    rock(168, 1, 0.5, 1.7);
    // Buoy Alley: rows of spiked buoys across the river with one opening, which jumps from
    // side to side. Touching a buoy hurts.
    [-4.2, 3.8, -2.6, 5, -5, 2.4].forEach((gc, i) => {
        const z = 214 + i * 17;
        const hw = halfWidth(z);
        const cx = centerX(z);
        for (let x = -hw + 1.4; x <= hw - 1.3; x += 3.1) {
            if (Math.abs(x - gc) < 5.7) continue;
            mines.push({ x: cx + x, z, r: 0.85 });
        }
    });
    // The Sweepers: spiked logs turning on pivots in the banks.
    [[305, 1], [335, -1], [365, 1]].forEach(([z, s], i) => {
        sweepers.push({ x: centerX(z) + s * (halfWidth(z) - 0.4), z, len: 8.2, speed: (i % 2 ? -1 : 1) * 1.15, phase: rng() * 6.28 });
    });
    // Log Jam: logs sliding across the whole river.
    [396, 411, 426, 441].forEach((z, i) => {
        logs.push({ x: centerX(z), z, half: 3.2, r: 0.8, amp: 5, speed: 1.25, phase: i * 1.7 });
    });
    // Hippo Falls: fast and narrow, boulders and boost pads.
    for (let z = 464, s = 1; z <= 516; z += 13, s = -s) rock(z, s, 0.38, 1.3);
    boosts.push({ x: centerX(472), z: 472, r: 2.6 }, { x: centerX(498), z: 498, r: 2.6 });

    // Geyser Gulch: vents that bubble, then blast whatever floats over them; lily pads that
    // gum up the raft; and pumpkin bumpers that fling it back.
    [[572, -3.5], [586, 4], [600, -4.5], [614, 3.5], [628, -2]].forEach(([z, dx], i) => {
        geysers.push({ x: centerX(z) + dx, z, r: 3.4, period: 4.6, phase: i * 1.1 });
    });
    lily.push({ x: centerX(580) + 4.5, z: 580, r: 4.2 }, { x: centerX(607) - 4, z: 607, r: 4.6 }, { x: centerX(634), z: 634, r: 4.2 });
    bumpers.push({ x: centerX(593) - 1, z: 593, r: 1.3 }, { x: centerX(607) + 6, z: 607, r: 1.3 }, { x: centerX(620) - 6, z: 620, r: 1.3 }, { x: centerX(632) + 3, z: 632, r: 1.3 });
    // Gator Marsh: paddle wheels, a rock gate, and gators patrolling across the river.
    spinners.push({ x: centerX(654), z: 654, len: 4.6, speed: 1.5, phase: 0.4 }, { x: centerX(706), z: 706, len: 4.6, speed: -1.6, phase: 2 });
    // Spinning things earlier on, too: a gentle paddle wheel to learn on, spiked propellers
    // (hazards) you have to stay out of the middle for, and a big wheel turning in the
    // whirlpool's eye.
    spinners.push(
        { x: centerX(121), z: 121, len: 4.4, speed: 1.2, phase: 1 },
        { x: centerX(186), z: 186, len: 5.2, speed: 1.35, phase: 0, bars: 1, hazard: true },
        { x: centerX(375), z: 375, len: 5, speed: -1.5, phase: 2.5, bars: 1, hazard: true },
        { x: centerX(538), z: 538, len: 7, speed: 0.8, phase: 0, bars: 2 },
    );
    for (const z of [666, 692]) gators.push({ x: centerX(z), z, half: 1.3, r: 0.75, amp: 6, speed: 1, phase: z * 0.37 });
    for (const side of [-1, 1]) rocks.push({ x: centerX(678) + side * 5.7, z: 678, r: 1.8 });

    const statics = [...rocks.map((o) => ({ ...o, hazard: false })), ...mines.map((o) => ({ ...o, hazard: true }))];

    // The river's two banks as line segments, for the raft to bump into.
    const walls = [];
    for (let z = -60; z < 820; z += SEG) {
        walls.push([
            [centerX(z) - halfWidth(z), z, centerX(z + SEG) - halfWidth(z + SEG), z + SEG],
            [centerX(z) + halfWidth(z), z, centerX(z + SEG) + halfWidth(z + SEG), z + SEG],
        ]);
    }

    const flowAt = (x, z) => {
        const f = interp(FLOW, z);
        let fx = 0;
        let fz = f;
        const vx = centerX(VORTEX.z);
        const dx = x - vx;
        const dz = z - VORTEX.z;
        const d = Math.hypot(dx, dz);
        if (d < VORTEX.r && d > 0.01) {
            const s = VORTEX.strength * smooth(1 - d / VORTEX.r);
            fx += (-dz / d) * s;
            fz += (dx / d) * s;
        }
        return [fx, fz];
    };

    return { centerX, halfWidth, flowAt, rocks, mines, sweepers, logs, boosts, geysers, lily, bumpers, gators, spinners, statics, walls, vortex: { x: centerX(VORTEX.z), z: VORTEX.z, r: VORTEX.r } };
};

let cached;
export const getCourse = () => (cached ??= buildCourse());

// The two ends of a sweeper's spiked log, and of a sliding log, at sim time t.
export const sweeperEnds = (s, t) => {
    const a = s.phase + s.speed * t;
    return [s.x, s.z, s.x + Math.sin(a) * s.len, s.z + Math.cos(a) * s.len];
};
export const logAt = (l, t) => {
    const x = l.x + l.amp * Math.sin(l.speed * t + l.phase);
    const vx = l.amp * l.speed * Math.cos(l.speed * t + l.phase);
    return { x, vx };
};

// Where a geyser is in its cycle at sim time t: quiet, bubbling a warning, or erupting.
export const GEYSER_WARN = 1.3;
export const GEYSER_BLAST = 0.9;
export const geyserAt = (g, t) => {
    const ph = (((t + g.phase) % g.period) + g.period) % g.period;
    if (ph < GEYSER_BLAST) return { state: 'erupt', k: ph / GEYSER_BLAST };
    if (ph > g.period - GEYSER_WARN) return { state: 'warn', k: (ph - (g.period - GEYSER_WARN)) / GEYSER_WARN };
    return { state: 'idle', k: 0 };
};
// The two bars of a paddle wheel at sim time t, each as its two ends, and how fast the ends move.
export const spinnerBars = (s, t) => {
    const a = s.phase + s.speed * t;
    const n = s.bars ?? 2;
    return Array.from({ length: n }, (_, k) => (k * Math.PI) / n).map((o) => {
        const sn = Math.sin(a + o);
        const cs = Math.cos(a + o);
        return { ends: [s.x - sn * s.len, s.z - cs * s.len, s.x + sn * s.len, s.z + cs * s.len], va: [-cs * s.len * s.speed, sn * s.len * s.speed], vb: [cs * s.len * s.speed, -sn * s.len * s.speed] };
    });
};

export const raftRadius = (seats) => RAFT_RADIUS[seats] ?? RAFT_RADIUS[4];
// How far from the raft's middle the hippos sit.
export const seatRadius = (seats) => raftRadius(seats) - 0.7;

export function createSim({ seats = 4, skill = 0.55, seed = 1 } = {}) {
    const count = seats === 2 ? 2 : 4;
    const course = getCourse();
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
        events: [],
        stuck: 0,
        hippos: Array.from({ length: count }, (_, i) => ({
            ang: (i / count) * Math.PI * 2 + Math.PI,
            mv: 0,
            fart: false,
            gas: 1,
            spent: false,
            bot: true,
            skill,
            brain: { next: 0, ax: 0, az: 0, drift: 0 },
        })),
    };
    // Seat 0 starts at the back so the first push goes forward.
    sim.hippos.forEach((h, i) => (h.ang = Math.PI + (i / count) * Math.PI * 2));

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
            if (farting) {
                h.gas = Math.max(0, h.gas - GAS_DRAIN * dt);
                if (h.gas <= 0) h.spent = true;
                const a = sim.yaw + h.ang;
                fx -= Math.sin(a) * THRUST[count];
                fz -= Math.cos(a) * THRUST[count];
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

        const [fx, fz] = crew(dt);
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
        const d = Math.hypot(sim.x - course.vortex.x, sim.z - course.vortex.z);
        if (d < course.vortex.r) sim.w += 0.35 * smooth(1 - d / course.vortex.r) * dt;
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
        if (sim.phase === 'run' && sim.z >= FINISH_Z) {
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
    const tx = best - sim.x;
    const tz = look;
    const len = Math.hypot(tx, tz);
    const vmax = 3.8 + skill * 1.6;
    const vdx = (tx / len) * vmax;
    const vdz = (tz / len) * vmax;
    const [fx, fz] = course.flowAt(sim.x, sim.z);
    // Counter the current's drift as well as chasing the wanted speed.
    let ax = vdx - sim.vx + fx * 0.2;
    let az = vdz - sim.vz + fz * 0.2;
    if (sim.phase !== 'run') ax = az = 0;
    // Wedged: back out, with a sideways nudge toward the middle of the river.
    if (sim.stuck > 1.5) {
        ax = (sim.course.centerX(sim.z) - sim.x) * 0.5;
        az = -5;
    }
    const noise = (rng() - 0.5) * 0.8 * (1 - skill);
    const c = Math.cos(noise);
    const s = Math.sin(noise);
    return [ax * c - az * s, ax * s + az * c];
}

function botDrive(sim, seat, dt, rng) {
    const h = sim.hippos[seat];
    const b = h.brain;
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
