// Types for the Monster Bash engine so the React/Phaser client can import it.

export type FighterSide = 0 | 1;
export type MoveKind = 'strike' | 'dash' | 'projectile';
export type FighterPose = 'idle' | 'walk' | 'windup' | 'strike' | 'recover' | 'hitstun' | 'block' | 'ko';
export type FightPhase = 'fighting' | 'break' | 'over';

export interface MonsterMove {
    id: string;
    name: string;
    kind: MoveKind;
    range: number;
    minRange?: number;
    damage: [number, number];
    startup: number;
    active: number;
    recovery: number;
    cooldown: number;
    knockback: number;
    hitstun: number;
    weight: number;
    hits?: number;
    speed?: number;
    effects?: {
        burn?: { perSecond: number; seconds: number };
        lifesteal?: number;
    };
}

export interface Monster {
    id: string;
    name: string;
    title: string;
    sprite: { url: string; frameWidth: number; frameHeight: number; frames: number; scale: number };
    stats: {
        maxHp: number;
        walkSpeed: number;
        width: number;
        weight: number;
        armor: number;
        evasion: number;
        blockChance: number;
        aggression: number;
        reaction: [number, number];
        preferredRange: number;
        poise: number;
        regen: number;
    };
    moves: MonsterMove[];
    special: MonsterMove;
}

export interface FighterSnapshot {
    x: number;
    hp: number;
    meter: number;
    pose: FighterPose;
    move: string | null;
    facing: 1 | -1;
    burning: boolean;
}

export interface FightFrame {
    t: number;
    round: number;
    roundTick: number;
    phase: FightPhase;
    fighters: [FighterSnapshot, FighterSnapshot];
}

export type FightEvent = { t: number } & (
    | { type: 'roundStart'; round: number }
    | { type: 'roundEnd'; round: number; winner: FighterSide; reason: 'ko' | 'time' }
    | { type: 'fightEnd'; winner: FighterSide }
    | { type: 'attack' | 'special'; f: FighterSide; move: string }
    | { type: 'guard'; f: FighterSide }
    | { type: 'dodge'; f: FighterSide; move: string }
    | { type: 'hit'; f: FighterSide; move: string; damage: number; crit: boolean; blocked: boolean; tanked: boolean }
    | { type: 'projectile'; id: number; f: FighterSide; move: string; x: number; dir: 1 | -1; speed: number }
    | { type: 'projectileEnd'; id: number; hit: boolean }
);

export interface FighterStats {
    damageDealt: number;
    hits: number;
    blocks: number;
    dodges: number;
    crits: number;
    specials: number;
}

export interface RoundResult {
    round: number;
    winner: FighterSide;
    reason: 'ko' | 'time';
    tick: number;
}

/** Opaque engine state; only the engine reads or writes its fields. */
export interface FightState {
    seed: string;
    tick: number;
    phase: FightPhase;
    round: number;
    roundWins: [number, number];
    rounds: RoundResult[];
    winner: FighterSide | null;
}

export interface FightResult {
    seed: string;
    fighters: [string, string];
    winner: FighterSide;
    rounds: RoundResult[];
    durationTicks: number;
    stats: [FighterStats, FighterStats];
    frames: FightFrame[];
    events: FightEvent[];
    checkpoints: { t: number; state: FightState }[];
    finalState: FightState;
}

export interface OddsPoint {
    t: number;
    /** Chance that fighter 0 wins, 0..1. */
    p: number;
}

export const ENGINE_VERSION: number;
export const TICK_RATE: number;
export const ARENA_WIDTH: number;
export const WALL_MARGIN: number;
export const ROUNDS_TO_WIN: number;
export const ROUND_TICKS: number;
export const ROUND_BREAK_TICKS: number;
export const METER_MAX: number;
export const DEFAULT_ROLLOUTS: number;

export const MONSTERS: Monster[];
export const MONSTERS_BY_ID: Record<string, Monster>;
export function getMonster(id: string): Monster;

export function moveDuration(move: MonsterMove): number;
export function moveReach(move: MonsterMove): number;
export function createFight(options: { seed: string; fighters: [string, string] }): FightState;
export function stepFight(state: FightState, events?: Omit<FightEvent, 't'>[] | null): FightState;
export function isFightOver(state: FightState): boolean;
export function snapshotFighter(state: FightState, index: FighterSide): FighterSnapshot;
export function snapshotFight(state: FightState): FightFrame;
export function simulateFight(
    options: { seed: string; fighters: [string, string] },
    settings?: { frameEvery?: number; checkpointEvery?: number; maxTicks?: number }
): FightResult;

export function estimateWinProbability(state: FightState, options?: { rollouts?: number; salt?: string }): number;
export function buildOddsSeries(
    checkpoints: { t: number; state: FightState }[],
    finalState: FightState,
    options?: { rollouts?: number; salt?: string }
): OddsPoint[];

export function hashSeed(input: string | number): number;
