// Types for the Hippo Rapids course and raft physics so the React/Three.js client can import them.

export const STEP: number;
export const RING_BONUS: number;
export const COOP_SPAN: number;
export const MAX_HULL: number;
export const COUNTDOWN: number;
export const SINK_TIME: number;
export const RIM_SPEED: number;
export const GAS_DRAIN: number;
export const GAS_REGEN: number;
export const GAS_RESTART: number;
export const HIPPO_NAMES: string[];
export const SEAT_COUNTS: number[];

export type Phase = 'countdown' | 'run' | 'done';

export interface Rock {
    x: number;
    z: number;
    r: number;
}
export interface Sweeper {
    x: number;
    z: number;
    len: number;
    speed: number;
    phase: number;
}
export interface Log {
    x: number;
    z: number;
    half: number;
    r: number;
    amp: number;
    speed: number;
    phase: number;
}
export interface Boost {
    x: number;
    z: number;
    r: number;
}

export interface Geyser {
    x: number;
    z: number;
    r: number;
    period: number;
    phase: number;
}
export interface Spinner {
    x: number;
    z: number;
    len: number;
    speed: number;
    phase: number;
    // How many bars cross at the hub (default 2); hazards hurt on contact.
    bars?: number;
    hazard?: boolean;
}

export type ItemType = 'rock' | 'mine' | 'bumper' | 'boost' | 'lily' | 'ring' | 'geyser' | 'sweeper' | 'log' | 'gator' | 'spinner' | 'gate' | 'headwind' | 'needle' | 'gust';

// One thing on the water. Which of the other fields matter depends on t.
export interface Item {
    t: ItemType;
    x: number;
    z: number;
    r?: number;
    len?: number;
    speed?: number;
    phase?: number;
    half?: number;
    amp?: number;
    period?: number;
    bars?: number;
    hazard?: number;
    need?: number;
    mode?: number;
    hold?: number;
    count?: number;
    slack?: number;
    force?: number;
}

export interface Level {
    v: 1;
    name: string;
    finish: number;
    center: [number, number][];
    width: [number, number][];
    flow: [number, number][];
    checkpoints: number[];
    sections: [number, string][];
    vortex: { z: number; r: number; strength: number } | null;
    items: Item[];
}

// A lock gate across the river. mode 0: `need` hippos farting together for `hold` seconds.
// mode 1: `count` unison taps.
export interface Gate {
    x: number;
    z: number;
    hw: number;
    need: number;
    mode: number;
    hold: number;
    count: number;
}

export interface Gust {
    z: number;
    len: number;
    force: number;
    period: number;
    phase: number;
}

export interface Course {
    def: Level;
    name: string;
    // Where the progress bar ends, and where the finish line is.
    length: number;
    finishZ: number;
    checkpoints: number[];
    sections: [number, string][];
    sectionAt(z: number): string;
    rings: Boost[];
    gates: Gate[];
    headwinds: { z: number; len: number; need: number }[];
    needles: { x: number; z: number; len: number; slack: number }[];
    gusts: Gust[];
    centerX(z: number): number;
    halfWidth(z: number): number;
    flowAt(x: number, z: number): [number, number];
    rocks: Rock[];
    mines: Rock[];
    sweepers: Sweeper[];
    logs: Log[];
    boosts: Boost[];
    geysers: Geyser[];
    lily: Boost[];
    bumpers: Rock[];
    gators: Log[];
    spinners: Spinner[];
    vortex: { x: number; z: number; r: number; strength: number } | null;
}

// One hippo in a snapshot: [angle on the rim, farting, gas 0..1, out of gas, walking -1/0/1, bot].
export type HippoState = [number, 0 | 1, number, 0 | 1, number, 0 | 1];

export type SimEvent =
    | { e: 'go' | 'sink' | 'respawn' | 'finish' | 'boost' }
    | { e: 'bump'; s: number }
    | { e: 'hit'; x: number; z: number }
    | { e: 'cp'; i: number }
    | { e: 'ring'; i: number }
    | { e: 'gate'; i: number; k: 'tap' | 'open' };

export interface Snapshot {
    t: number;
    ph: Phase;
    cd: number;
    run: number;
    x: number;
    z: number;
    yaw: number;
    vx: number;
    vz: number;
    w: number;
    hull: number;
    inv: boolean;
    sunk: number;
    cp: number;
    sinks: number;
    hits: number;
    // Which rings have been flown through.
    rg: number[];
    // Each lock gate: [open, charge 0..1, taps so far].
    gt: [0 | 1, number, number][];
    h: HippoState[];
    ev: SimEvent[];
}

export interface Hippo {
    ang: number;
    mv: number;
    fart: boolean;
    live?: boolean;
    gas: number;
    spent: boolean;
    bot: boolean;
    skill: number;
}

export interface Sim {
    seats: number;
    R: number;
    seatR: number;
    t: number;
    phase: Phase;
    countdown: number;
    x: number;
    z: number;
    vx: number;
    vz: number;
    yaw: number;
    w: number;
    hull: number;
    sunk: number;
    cp: number;
    hippos: Hippo[];
    course: Course;
    rings: Set<number>;
    gates: { open: boolean; charge: number; taps: number }[];
    stuck: number;
    inv: number;
    run: number;
    sinks: number;
    hits: number;
    R: number;
    step(dt?: number): void;
    setInput(seat: number, mv: number, fart: boolean): void;
    snapshot(): Snapshot;
    reset(): void;
}

export interface LevelInfo {
    id: string;
    blurb: string;
    color: string;
    // Seconds for gold, silver and bronze, counted after the ring bonus.
    par: [number, number, number];
    def: Level;
}
export const LEVELS: LevelInfo[];
export const ITEM_TYPES: Record<ItemType, Record<string, [number, number, number]>>;
export function getLevel(id: string): LevelInfo | null;
// Makes anything into a valid level, or null.
export function sanitizeLevel(raw: unknown): Level | null;
// A level can be a built-in's id, a level as the editor saves it, or an already built course.
export function getCourse(level?: string | Level | Course): Course;
export function createSim(options?: { seats?: number; skill?: number; seed?: number; level?: string | Level | Course }): Sim;
export function raftRadius(seats: number): number;
export function seatRadius(seats: number): number;
export function wrapAngle(a: number): number;
export function sweeperEnds(s: Sweeper, t: number): [number, number, number, number];
export function logAt(l: Log, t: number): { x: number; vx: number };
export const GEYSER_WARN: number;
// A crosswind's push at time t in hippos' worth of fart (+ is toward +x).
export function gustAt(g: Gust, t: number): number;
export const GEYSER_BLAST: number;
export function geyserAt(g: Geyser, t: number): { state: 'idle' | 'warn' | 'erupt'; k: number };
export function spinnerBars(s: Spinner, t: number): { ends: [number, number, number, number]; va: [number, number]; vb: [number, number] }[];
