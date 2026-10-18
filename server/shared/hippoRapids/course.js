// A Hippo Rapids level, and turning one into a course the sim can run.
//
// A level is plain JSON (so it can be saved, shared as a code and sent to the server):
//
//   { v: 1, name, finish, center: [[z, x]], width: [[z, halfWidth]], flow: [[z, speed]],
//     checkpoints: [z], sections: [[z, name]], vortex: null | { z, r, strength },
//     items: [{ t: 'rock', x, z, r }, ...] }
//
// The river flows toward +z; the raft starts at z = 0 and the level ends at z = finish. The
// centreline, width and current are lists of points joined smoothly. Everything on the water
// is an item. Anything that moves on its own is a pure function of the sim clock, so a
// snapshot only has to carry the raft.

export const SEG = 5;
const WALL_FROM = -60;

export const smooth = (t) => t * t * (3 - 2 * t);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function interp(points, z) {
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

// What can be placed, and the range each field can take. Defaults fill whatever's missing.
export const ITEM_TYPES = {
    rock: { r: [0.6, 3.5, 1.5] },
    mine: { r: [0.5, 1.5, 0.85] },
    bumper: { r: [0.8, 2, 1.3] },
    boost: { r: [1.5, 4, 2.6] },
    lily: { r: [2, 7, 4.2] },
    ring: {},
    geyser: { r: [2, 5, 3.4], period: [3, 9, 4.6], phase: [0, 9, 0] },
    sweeper: { len: [3, 12, 8.2], speed: [-3, 3, 1.15], phase: [0, 6.3, 0] },
    log: { half: [1, 6, 3.2], amp: [0, 9, 5], speed: [0.3, 3, 1.25], phase: [0, 6.3, 0] },
    gator: { half: [0.8, 2.5, 1.3], amp: [0, 9, 6], speed: [0.3, 3, 1], phase: [0, 6.3, 0] },
    spinner: { len: [2.5, 9, 4.6], speed: [-3, 3, 1.3], phase: [0, 6.3, 0], bars: [1, 4, 2], hazard: [0, 1, 0] },
    // Teamwork: a lock gate that opens when `need` hippos fart together (mode 0: hold it for
    // `hold` seconds; mode 1: `count` unison taps), and a stretch of headwind that only `need`
    // hippos pushing at once can climb.
    gate: { need: [1, 4, 2], mode: [0, 1, 0], hold: [0.6, 4, 1.4], count: [1, 8, 3] },
    headwind: { len: [6, 40, 12], need: [1, 4, 2] },
};

const MAX_ITEMS = 450;
const INT_KEYS = new Set(['bars', 'hazard', 'need', 'mode', 'count']);
const MAX_POINTS = 60;
const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : dflt);

function cleanPoints(raw, lo, hi, dflt, finish) {
    const pts = Array.isArray(raw)
        ? raw
              .filter((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && Number.isFinite(n)))
              .slice(0, MAX_POINTS)
              .map(([z, v]) => [clamp(z, -200, finish + 200), clamp(v, lo, hi)])
        : [];
    pts.sort((a, b) => a[0] - b[0]);
    // Two points at the same z would divide by zero when blended.
    const out = [];
    for (const p of pts) if (!out.length || p[0] - out[out.length - 1][0] > 0.5) out.push(p);
    return out.length ? out : [[-80, dflt], [finish + 100, dflt]];
}

// Makes any input into a valid level, or null if it isn't one at all. Never throws.
export function sanitizeLevel(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const finish = num(raw.finish, 80, 1400, 300);
    const items = [];
    for (const it of Array.isArray(raw.items) ? raw.items.slice(0, MAX_ITEMS) : []) {
        const spec = it && ITEM_TYPES[it.t];
        if (!spec) continue;
        if (typeof it.x !== 'number' || typeof it.z !== 'number' || !Number.isFinite(it.x) || !Number.isFinite(it.z)) continue;
        const out = { t: it.t, x: Math.round(clamp(it.x, -80, 80) * 100) / 100, z: Math.round(clamp(it.z, 5, finish + 20) * 100) / 100 };
        for (const [k, [lo, hi, dflt]] of Object.entries(spec)) {
            const v = num(it[k], lo, hi, dflt);
            out[k] = INT_KEYS.has(k) ? Math.round(v) : Math.round(v * 100) / 100;
        }
        items.push(out);
    }
    const checkpoints = (Array.isArray(raw.checkpoints) ? raw.checkpoints : [])
        .filter((z) => typeof z === 'number' && Number.isFinite(z) && z > 20 && z < finish - 15)
        .slice(0, 20)
        .sort((a, b) => a - b);
    const sections = (Array.isArray(raw.sections) ? raw.sections : [])
        .filter((s) => Array.isArray(s) && typeof s[0] === 'number' && Number.isFinite(s[0]) && typeof s[1] === 'string')
        .slice(0, 20)
        .map(([z, n]) => [clamp(z, -80, finish), n.replace(/[^\p{L}\p{N} '_.-]/gu, '').slice(0, 24)])
        .sort((a, b) => a[0] - b[0]);
    const v = raw.vortex && typeof raw.vortex === 'object' ? raw.vortex : null;
    return {
        v: 1,
        name: typeof raw.name === 'string' ? raw.name.replace(/[^\p{L}\p{N} '_.!-]/gu, '').trim().slice(0, 24) || 'My River' : 'My River',
        finish,
        center: cleanPoints(raw.center, -60, 60, 0, finish),
        width: cleanPoints(raw.width, 8, 20, 12, finish),
        flow: cleanPoints(raw.flow, 0, 6, 1.2, finish),
        checkpoints,
        sections: sections.length ? sections : [[-80, 'The River']],
        vortex: v ? { z: num(v.z, 20, finish, finish * 0.7), r: num(v.r, 6, 24, 16), strength: num(v.strength, 0.5, 4, 2.4) } : null,
        items,
    };
}

// The runtime course: lookups and lists the sim, bots and renderer use.
export function buildCourse(def) {
    const centerX = (z) => interp(def.center, z);
    const halfWidth = (z) => interp(def.width, z);
    const of = (t) => def.items.filter((it) => it.t === t);
    const rocks = of('rock').map(({ x, z, r }) => ({ x, z, r }));
    const mines = of('mine').map(({ x, z, r }) => ({ x, z, r }));
    const statics = [...rocks.map((o) => ({ ...o, hazard: false })), ...mines.map((o) => ({ ...o, hazard: true }))];

    // The river's two banks as line segments, for the raft to bump into.
    const walls = [];
    for (let z = WALL_FROM; z < def.finish + 110; z += SEG) {
        walls.push([
            [centerX(z) - halfWidth(z), z, centerX(z + SEG) - halfWidth(z + SEG), z + SEG],
            [centerX(z) + halfWidth(z), z, centerX(z + SEG) + halfWidth(z + SEG), z + SEG],
        ]);
    }

    const vortex = def.vortex ? { x: centerX(def.vortex.z), z: def.vortex.z, r: def.vortex.r, strength: def.vortex.strength } : null;
    const flowAt = (x, z) => {
        let fx = 0;
        let fz = interp(def.flow, z);
        if (vortex) {
            const dx = x - vortex.x;
            const dz = z - vortex.z;
            const d = Math.hypot(dx, dz);
            if (d < vortex.r && d > 0.01) {
                const s = vortex.strength * smooth(1 - d / vortex.r);
                fx += (-dz / d) * s;
                fz += (dx / d) * s;
            }
        }
        return [fx, fz];
    };

    const sections = def.sections;
    return {
        def,
        name: def.name,
        length: def.finish + 4,
        finishZ: def.finish,
        checkpoints: def.checkpoints,
        sections,
        sectionAt(z) {
            let name = sections[0][1];
            for (const [from, label] of sections) if (z >= from) name = label;
            return name;
        },
        centerX,
        halfWidth,
        flowAt,
        rocks,
        mines,
        sweepers: of('sweeper').map(({ x, z, len, speed, phase }) => ({ x, z, len, speed, phase })),
        logs: of('log').map(({ x, z, half, amp, speed, phase }) => ({ x, z, half, r: 0.8, amp, speed, phase })),
        boosts: of('boost').map(({ x, z, r }) => ({ x, z, r })),
        geysers: of('geyser').map(({ x, z, r, period, phase }) => ({ x, z, r, period, phase })),
        lily: of('lily').map(({ x, z, r }) => ({ x, z, r })),
        bumpers: of('bumper').map(({ x, z, r }) => ({ x, z, r })),
        gators: of('gator').map(({ x, z, half, amp, speed, phase }) => ({ x, z, half, r: 0.75, amp, speed, phase })),
        spinners: of('spinner').map(({ x, z, len, speed, phase, bars, hazard }) => ({ x, z, len, speed, phase, bars, hazard: !!hazard })),
        gates: of('gate').map(({ z, need, mode, hold, count }) => ({ z, need, mode, hold, count, x: centerX(z), hw: halfWidth(z) })),
        headwinds: of('headwind').map(({ z, len, need }) => ({ z, len, need })),
        rings: of('ring').map(({ x, z }) => ({ x, z, r: 2.7 })),
        statics,
        walls,
        vortex,
    };
}

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

// The bars of a paddle wheel at sim time t, each as its two ends, and how fast the ends move.
export const spinnerBars = (s, t) => {
    const a = s.phase + s.speed * t;
    const n = s.bars ?? 2;
    return Array.from({ length: n }, (_, k) => (k * Math.PI) / n).map((o) => {
        const sn = Math.sin(a + o);
        const cs = Math.cos(a + o);
        return { ends: [s.x - sn * s.len, s.z - cs * s.len, s.x + sn * s.len, s.z + cs * s.len], va: [-cs * s.len * s.speed, sn * s.len * s.speed], vb: [cs * s.len * s.speed, -sn * s.len * s.speed] };
    });
};
