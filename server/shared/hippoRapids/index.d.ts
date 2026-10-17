// Types for the Hippo Rapids course and raft physics so the React/Three.js client can import them.

export const STEP: number;
export const COURSE_LENGTH: number;
export const FINISH_Z: number;
export const MAX_HULL: number;
export const COUNTDOWN: number;
export const SINK_TIME: number;
export const RIM_SPEED: number;
export const GAS_DRAIN: number;
export const GAS_REGEN: number;
export const GAS_RESTART: number;
export const HIPPO_NAMES: string[];
export const SEAT_COUNTS: number[];
export const CHECKPOINTS: number[];
export const SECTIONS: [number, string][];

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

export interface Course {
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
    vortex: { x: number; z: number; r: number };
}

// One hippo in a snapshot: [angle on the rim, farting, gas 0..1, out of gas, walking -1/0/1, bot].
export type HippoState = [number, 0 | 1, number, 0 | 1, number, 0 | 1];

export type SimEvent =
    | { e: 'go' | 'sink' | 'respawn' | 'finish' | 'boost' }
    | { e: 'bump'; s: number }
    | { e: 'hit'; x: number; z: number }
    | { e: 'cp'; i: number };

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
    step(dt?: number): void;
    setInput(seat: number, mv: number, fart: boolean): void;
    snapshot(): Snapshot;
    reset(): void;
}

export function getCourse(): Course;
export function createSim(options?: { seats?: number; skill?: number; seed?: number }): Sim;
export function sectionAt(z: number): string;
export function raftRadius(seats: number): number;
export function seatRadius(seats: number): number;
export function wrapAngle(a: number): number;
export function sweeperEnds(s: Sweeper, t: number): [number, number, number, number];
export function logAt(l: Log, t: number): { x: number; vx: number };
export const GEYSER_WARN: number;
export const GEYSER_BLAST: number;
export function geyserAt(g: Geyser, t: number): { state: 'idle' | 'warn' | 'erupt'; k: number };
export function spinnerBars(s: Spinner, t: number): { ends: [number, number, number, number]; va: [number, number]; vb: [number, number] }[];
