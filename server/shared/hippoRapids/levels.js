// The built-in Hippo Rapids levels. Each is a plain level (see course.js) put together with a
// few helpers; the editor makes the same kind of thing by hand.

import { interp, sanitizeLevel } from './course.js';

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

// A level being put together: where the river is, and helpers that place things relative to it.
function draft(spec, seed = 7) {
    const rng = mulberry32(seed);
    const cx = (z) => interp(spec.center, z);
    const hw = (z) => interp(spec.width, z);
    const items = [];
    const add = (t, o) => items.push({ t, ...o });
    const api = {
        rng,
        cx,
        hw,
        items,
        add,
        at: (t, z, dx = 0, o = {}) => add(t, { x: cx(z) + dx, z, ...o }),
        // Boulders sit near the middle (never in a gap narrower than a raft against a bank),
        // so each one is a choice of left or right.
        rock(z, side, spread, r) {
            const w = hw(z);
            add('rock', { x: cx(z) + side * Math.max(0.6, Math.min(w * spread, w - r - 7.4)), z, r });
        },
        // Boulders weaving left and right.
        weave(zs, r = 1.6, spread = 0.45) {
            zs.forEach((z, i) => api.rock(z, i % 2 ? -1 : 1, spread, r + api.rng() * 0.5));
        },
        // A row of spiked buoys across the river with one opening at gc.
        row(z, gc) {
            const w = hw(z);
            for (let x = -w + 1.4; x <= w - 1.3; x += 3.1) if (Math.abs(x - gc) >= 5.7) add('mine', { x: cx(z) + x, z, r: 0.85 });
        },
        // A spiked log turning on a post in the bank.
        sweeper(z, side, speed = 1.15) {
            add('sweeper', { x: cx(z) + side * (hw(z) - 0.4), z, len: 8.2, speed, phase: rng() * 6.28 });
        },
        // Rings are worth a second off your time each: put them where the fast line goes.
        rings(list) {
            for (const [z, dx] of list) add('ring', { x: cx(z) + dx, z });
        },
    };
    return api;
}

const level = (spec, d) =>
    sanitizeLevel({
        v: 1,
        name: spec.name,
        finish: spec.finish,
        center: spec.center,
        width: spec.width,
        flow: spec.flow,
        checkpoints: spec.checkpoints,
        sections: spec.sections,
        vortex: spec.vortex ?? null,
        items: d.items,
    });

function lagoon() {
    const spec = {
        name: 'Lazy Lagoon',
        finish: 230,
        center: [[-80, 0], [90, 0], [130, -4], [170, 4], [210, 0], [400, 0]],
        width: [[-80, 14], [400, 14]],
        flow: [[-80, 1], [400, 1.1]],
        checkpoints: [115],
        sections: [[-80, 'The Dock'], [38, 'Rock Weave'], [105, 'Paddle Pass'], [165, 'Easy Does It']],
    };
    const d = draft(spec, 11);
    d.weave([48, 64, 80, 96], 1.5);
    d.at('spinner', 128, 0, { len: 4.2, speed: 1.1, phase: 1 });
    d.at('boost', 160, 0, { r: 2.6 });
    d.sweeper(190, 1, 0.8);
    d.rings([[38, 2], [72, -3], [104, 3], [150, -2], [185, -1], [215, 2]]);
    return level(spec, d);
}

function bend() {
    const spec = {
        name: 'Boulder Bend',
        finish: 300,
        center: [[-80, 0], [50, 0], [90, -9], [135, 9], [180, -9], [225, 9], [265, 0], [500, 0]],
        width: [[-80, 13], [60, 12.5], [200, 12], [500, 12]],
        flow: [[-80, 1], [500, 1.3]],
        checkpoints: [105, 205],
        sections: [[-80, 'The Dock'], [45, 'Switchbacks'], [235, 'Prop Wash']],
    };
    const d = draft(spec, 21);
    d.rock(70, 1, 0.5, 1.7);
    d.rock(112, -1, 0.5, 1.9);
    d.rock(152, 1, 0.5, 2.1);
    d.rock(198, -1, 0.5, 1.9);
    d.at('lily', 130, 6, { r: 4 });
    d.at('lily', 178, -6, { r: 4 });
    d.at('spinner', 250, 0, { len: 5.2, speed: 1.35, phase: 0, bars: 1, hazard: 1 });
    d.rings([[60, -3], [92, -7], [132, 7], [182, -7], [226, 7], [270, 0]]);
    return level(spec, d);
}

function alley() {
    const spec = {
        name: 'Buoy Alley',
        finish: 300,
        center: [[-80, 0], [500, 0]],
        width: [[-80, 13], [50, 12], [500, 11.5]],
        flow: [[-80, 1], [500, 1.2]],
        checkpoints: [105, 200],
        sections: [[-80, 'The Dock'], [45, 'Buoy Alley'], [175, 'The Sweepers']],
    };
    const d = draft(spec, 31);
    [-4.2, 3.8, -2.6, 5, -5, 2.4].forEach((gc, i) => d.row(60 + i * 19, gc));
    d.sweeper(185, 1);
    d.sweeper(212, -1);
    d.sweeper(239, 1);
    d.at('rock', 270, 0, { r: 1.6 });
    d.rings([[60, -4], [98, -3], [136, 4], [155, 2], [196, -2], [225, 1], [265, 3]]);
    return level(spec, d);
}

function logJam() {
    const spec = {
        name: 'Log Jam',
        finish: 310,
        center: [[-80, 0], [500, 0]],
        width: [[-80, 13], [50, 11.5], [500, 11]],
        flow: [[-80, 1], [500, 1.4]],
        checkpoints: [110, 205],
        sections: [[-80, 'The Dock'], [50, 'Log Jam'], [175, 'Spike Spin'], [240, 'Log Jam Two']],
    };
    const d = draft(spec, 41);
    [66, 82, 98, 114].forEach((z, i) => d.at('log', z, 0, { half: 3.2, amp: 5, speed: 1.25, phase: i * 1.7 }));
    d.at('spinner', 175, 0, { len: 5, speed: -1.5, phase: 2.5, bars: 1, hazard: 1 });
    d.weave([140, 155], 1.7);
    [235, 251, 267, 283].forEach((z, i) => d.at('log', z, 0, { half: 3.2, amp: 5, speed: 1.4, phase: i * 2.3 + 1 }));
    d.rings([[66, 0], [98, 0], [130, 3], [170, -5], [215, 0], [245, 0], [290, 0]]);
    return level(spec, d);
}

function gulch() {
    const spec = {
        name: 'Geyser Gulch',
        finish: 320,
        center: [[-80, 0], [60, 0], [120, 5], [180, -5], [240, 3], [500, 0]],
        width: [[-80, 13], [60, 12.5], [500, 12]],
        flow: [[-80, 1], [500, 1.4]],
        checkpoints: [110, 210],
        sections: [[-80, 'The Dock'], [45, 'Hot Springs'], [150, 'Bumper Bog'], [235, 'Geyser Gulch']],
    };
    const d = draft(spec, 51);
    [[62, -3.5], [78, 4], [94, -4.5]].forEach(([z, dx], i) => d.at('geyser', z, dx, { r: 3.4, period: 4.6, phase: i * 1.1 }));
    d.at('lily', 118, 4.5, { r: 4.2 });
    d.at('lily', 145, -4, { r: 4.6 });
    [[130, -1], [152, 6], [165, -6], [178, 3]].forEach(([z, dx]) => d.at('bumper', z, dx, { r: 1.3 }));
    [[200, -3.5], [214, 4], [228, -4.5], [242, 3.5], [256, -2], [270, 3]].forEach(([z, dx], i) => d.at('geyser', z, dx, { r: 3.4, period: 4.6, phase: i * 1.1 }));
    d.at('lily', 222, 4.5, { r: 4.2 });
    d.at('lily', 262, -4, { r: 4.4 });
    d.rings([[58, 0], [100, 2], [136, 4], [160, -2], [185, 0], [205, 2], [248, 0], [290, 0]]);
    return level(spec, d);
}

function marsh() {
    const spec = {
        name: 'Gator Marsh',
        finish: 330,
        center: [[-80, 0], [60, 0], [110, 6], [160, -6], [210, 0], [500, 0]],
        width: [[-80, 13], [60, 12.5], [150, 12], [180, 14.5], [196, 12], [500, 12]],
        flow: [[-80, 1], [500, 1.2]],
        checkpoints: [115, 225],
        sections: [[-80, 'The Dock'], [45, 'Gator Marsh'], [150, 'The Gate'], [200, 'Wheel House']],
    };
    const d = draft(spec, 61);
    d.at('spinner', 75, 0, { len: 4.6, speed: 1.5, phase: 0.4 });
    [100, 126].forEach((z, i) => d.at('gator', z, 0, { half: 1.3, amp: 6, speed: 1, phase: z * 0.37 + i }));
    d.at('lily', 150, -5, { r: 4.2 });
    for (const side of [-1, 1]) d.at('rock', 180, side * 5.7, { r: 1.8 });
    [212, 240].forEach((z, i) => d.at('gator', z, 0, { half: 1.3, amp: 6, speed: 1.05, phase: z * 0.5 + i }));
    d.at('spinner', 262, 0, { len: 4.6, speed: -1.6, phase: 2 });
    d.at('spinner', 295, 0, { len: 5.2, speed: 1.4, phase: 1, bars: 1, hazard: 1 });
    d.rings([[60, 3], [88, -3], [113, 4], [165, -3], [180, 0], [226, 0], [278, 4], [310, 0]]);
    return level(spec, d);
}

function falls() {
    const spec = {
        name: 'Hippo Falls',
        finish: 320,
        center: [[-80, 0], [60, 0], [110, 8], [160, -8], [200, 0], [500, 0]],
        width: [[-80, 13], [60, 12], [100, 10], [220, 9.5], [250, 12.5], [500, 12.5]],
        flow: [[-80, 1], [90, 1.3], [105, 3], [215, 3.2], [235, 1.2], [500, 1.2]],
        checkpoints: [105, 215],
        sections: [[-80, 'The Dock'], [45, 'Bend'], [100, 'Hippo Falls'], [215, 'The Whirlpool']],
        vortex: { z: 262, r: 17, strength: 2.4 },
    };
    const d = draft(spec, 71);
    d.weave([62, 78], 1.5);
    for (let z = 122, s = 1; z <= 200; z += 13, s = -s) d.rock(z, s, 0.38, 1.3);
    d.at('boost', 118, 0, { r: 2.6 });
    d.at('boost', 168, 0, { r: 2.6 });
    d.at('spinner', 262, 0, { len: 7, speed: 0.8, phase: 0, bars: 2 });
    d.rings([[60, 0], [112, 5], [148, -3], [175, 0], [205, -2], [240, 0], [285, 0]]);
    return level(spec, d);
}

// Teamwork: lock gates that open when enough hippos fart together, in a hold or in unison taps.
function chorus() {
    const spec = {
        name: 'Chorus Locks',
        finish: 300,
        center: [[-80, 0], [500, 0]],
        width: [[-80, 13], [500, 12.5]],
        flow: [[-80, 1], [500, 1.1]],
        checkpoints: [75, 150, 225],
        sections: [[-80, 'The Dock'], [45, 'First Lock'], [120, 'Tap Lock'], [195, 'Big Lock']],
    };
    const d = draft(spec, 81);
    d.weave([40, 58], 1.5);
    d.at('gate', 100, 0, { need: 2, mode: 0, hold: 1.2 });
    d.weave([118, 134], 1.6);
    d.at('gate', 175, 0, { need: 2, mode: 1, count: 3 });
    d.at('bumper', 195, -5, { r: 1.3 });
    d.at('bumper', 205, 5, { r: 1.3 });
    d.at('gate', 250, 0, { need: 3, mode: 0, hold: 1.6 });
    d.rings([[40, 2], [88, -2], [118, 3], [163, 0], [200, 0], [238, -2], [275, 0]]);
    return level(spec, d);
}

// Teamwork: headwinds that only a whole crew pushing at once can climb, with pools to rest in.
function climb() {
    const spec = {
        name: 'Upstream Climb',
        finish: 320,
        center: [[-80, 0], [500, 0]],
        width: [[-80, 13], [500, 12.5]],
        flow: [[-80, 1], [500, 1.2]],
        checkpoints: [70, 130, 200, 250],
        sections: [[-80, 'The Dock'], [45, 'First Step'], [105, 'Second Step'], [175, 'Third Step'], [235, 'Last Lock']],
    };
    const d = draft(spec, 91);
    d.at('headwind', 82, 0, { len: 5, need: 2 });
    d.rock(110, 1, 0.4, 1.6);
    d.at('headwind', 140, 0, { len: 5, need: 3 });
    d.weave([120], 1.5);
    d.at('lily', 165, 4, { r: 4 });
    d.at('headwind', 205, 0, { len: 5, need: 3 });
    d.at('gate', 262, 0, { need: 3, mode: 1, count: 4 });
    d.rings([[60, 0], [95, 0], [128, 3], [160, -3], [190, 0], [225, 0], [255, 0], [295, 0]]);
    return level(spec, d);
}

// The original 722 m river, start to finish.
function wholeRiver() {
    const spec = {
        name: 'The Whole River',
        finish: 718,
        center: [[-80, 0], [112, 0], [145, -7], [180, 7], [208, 0], [400, 0], [440, 8], [480, -8], [520, 0], [600, 0], [640, 6], [680, -6], [720, 0], [900, 0]],
        width: [[-80, 13], [40, 13], [90, 11.5], [290, 11.5], [330, 11], [440, 11], [470, 9.5], [520, 9.5], [545, 12.5], [560, 12], [665, 12], [678, 14.5], [692, 12], [900, 12]],
        flow: [[-80, 1], [440, 1.4], [455, 3], [515, 3.2], [535, 1.2], [900, 1.2]],
        checkpoints: [110, 200, 295, 385, 455, 525, 575, 650],
        sections: [[-80, 'The Dock'], [40, 'Boulder Bend'], [195, 'Buoy Alley'], [295, 'The Sweepers'], [385, 'Log Jam'], [455, 'Hippo Falls'], [525, 'The Whirlpool'], [560, 'Geyser Gulch'], [640, 'Gator Marsh']],
        vortex: { z: 540, r: 17, strength: 2.4 },
    };
    const d = draft(spec, 1031);
    const { rng } = d;
    let side = 1;
    for (let z = 56; z <= 104; z += 12) {
        d.rock(z, side, 0.4 + rng() * 0.1, 1.2 + rng() * 0.7);
        side = -side;
    }
    d.rock(134, 1, 0.5, 1.9);
    d.rock(156, -1, 0.5, 2.1);
    d.rock(168, 1, 0.5, 1.7);
    [-4.2, 3.8, -2.6, 5, -5, 2.4].forEach((gc, i) => d.row(214 + i * 17, gc));
    [[305, 1], [335, -1], [365, 1]].forEach(([z, s], i) => d.sweeper(z, s, (i % 2 ? -1 : 1) * 1.15));
    [396, 411, 426, 441].forEach((z, i) => d.at('log', z, 0, { half: 3.2, amp: 5, speed: 1.25, phase: i * 1.7 }));
    for (let z = 464, s = 1; z <= 516; z += 13, s = -s) d.rock(z, s, 0.38, 1.3);
    d.at('boost', 472, 0, { r: 2.6 });
    d.at('boost', 498, 0, { r: 2.6 });
    [[572, -3.5], [586, 4], [600, -4.5], [614, 3.5], [628, -2]].forEach(([z, dx], i) => d.at('geyser', z, dx, { r: 3.4, period: 4.6, phase: i * 1.1 }));
    d.at('lily', 580, 4.5, { r: 4.2 });
    d.at('lily', 607, -4, { r: 4.6 });
    d.at('lily', 634, 0, { r: 4.2 });
    [[593, -1], [607, 6], [620, -6], [632, 3]].forEach(([z, dx]) => d.at('bumper', z, dx, { r: 1.3 }));
    d.at('spinner', 654, 0, { len: 4.6, speed: 1.5, phase: 0.4 });
    d.at('spinner', 706, 0, { len: 4.6, speed: -1.6, phase: 2 });
    d.at('spinner', 121, 0, { len: 4.4, speed: 1.2, phase: 1 });
    d.at('spinner', 186, 0, { len: 5.2, speed: 1.35, phase: 0, bars: 1, hazard: 1 });
    d.at('spinner', 375, 0, { len: 5, speed: -1.5, phase: 2.5, bars: 1, hazard: 1 });
    d.at('spinner', 538, 0, { len: 7, speed: 0.8, phase: 0, bars: 2 });
    [666, 692].forEach((z) => d.at('gator', z, 0, { half: 1.3, amp: 6, speed: 1, phase: z * 0.37 }));
    for (const s of [-1, 1]) d.at('rock', 678, s * 5.7, { r: 1.8 });
    d.rings([[60, 2], [150, 3], [230, 0], [320, 0], [410, 0], [490, 0], [545, 0], [600, 0], [650, 0], [700, 0]]);
    return level(spec, d);
}

// Easiest first. par: seconds for gold, silver and bronze, counted after the ring bonus.
export const LEVELS = [
    { id: 'lagoon', par: [65, 80, 100], blurb: 'Learn to toot. Wide water, a few rocks.', color: '#4ec27a', make: lagoon },
    { id: 'bend', par: [85, 100, 130], blurb: 'Two switchbacks and a spiked propeller.', color: '#4aa9f0', make: bend },
    { id: 'alley', par: [80, 100, 130], blurb: 'Buoys, then spiked logs on swinging posts.', color: '#a06bd8', make: alley },
    { id: 'logjam', par: [100, 120, 155], blurb: 'Time the sliding logs. Mind the propeller.', color: '#d98a3a', make: logJam },
    { id: 'gulch', par: [95, 115, 150], blurb: 'Geysers, lily pads and pumpkin bumpers.', color: '#e0584a', make: gulch },
    { id: 'marsh', par: [100, 120, 155], blurb: 'Gators, paddle wheels and a rock gate.', color: '#6a9a3a', make: marsh },
    { id: 'falls', par: [80, 100, 125], blurb: 'Fast, narrow rapids into a whirlpool.', color: '#3a6ad8', make: falls },
    { id: 'chorus', par: [90, 110, 145], blurb: 'Teamwork! Fart together to open the locks.', color: '#e8a0d0', make: chorus },
    { id: 'climb', par: [115, 140, 180], blurb: 'Teamwork! Only a whole crew can climb the headwind.', color: '#80c8e8', make: climb },
    { id: 'whole', par: [290, 350, 450], blurb: 'All of it, start to finish. Bring snacks.', color: '#c8a23a', make: wholeRiver },
].map((l) => ({ ...l, def: l.make() }));

const byId = new Map(LEVELS.map((l) => [l.id, l]));
export const getLevel = (id) => byId.get(id) ?? null;
