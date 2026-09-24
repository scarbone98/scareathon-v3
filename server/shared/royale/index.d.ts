// Types for the lane-battler engine so the React/Three.js client can import it.

export type Team = 0 | 1;
export type CardType = 'unit' | 'building' | 'spell';
export type Targets = 'ground' | 'all' | 'buildings';

export interface CardSprite {
    url: string;
    frameWidth: number;
    frameHeight: number;
    frames: number;
    height: number;
    front?: boolean;
}

export interface Card {
    id: string;
    name: string;
    type: CardType;
    cost: number;
    sprite: CardSprite;
    count?: number;
    hp?: number;
    damage?: number;
    hitSpeed?: number;
    range?: number;
    speed?: number;
    targets?: Targets;
    radius?: number;
    mass?: number;
    flying?: boolean;
    projectileSpeed?: number;
    splash?: number;
    lifetime?: number;
    deathDamage?: number;
    deathRadius?: number;
    towerScale?: number;
    travel?: number;
    stun?: number;
}

export const CARDS: Card[];
export const DECK_SIZE: number;
export function getCard(id: string): Card;
export function hasCard(id: string): boolean;
export function validateDeck(deck: string[]): string | null;
export function cardPower(card: Card): number | null;

export const ENGINE_VERSION: number;
export const TICK_RATE: number;
export const HALF_WIDTH: number;
export const HALF_LENGTH: number;
export const RIVER_HALF: number;
export const BRIDGE_X: number;
export const BRIDGE_HALF_WIDTH: number;
export const HAND_SIZE: number;
export const ELIXIR_MAX: number;
export const START_ELIXIR: number;
export const ELIXIR_SECONDS: number;
export const DEPLOY_TICKS: number;
export const MATCH_TICKS: number;
export const DOUBLE_ELIXIR_TICK: number;
export const OVERTIME_TICKS: number;
export const SIGHT_RANGE: number;
export const TOWERS: Record<'princess' | 'king', { hp: number; damage: number; hitSpeed: number; range: number; radius: number; projectileSpeed: number; z: number }>;

export interface Play {
    team: Team;
    card: string;
    x: number;
    z: number;
}

export interface Player {
    deck: string[];
    elixir: number;
    hand: string[];
    queue: string[];
    crowns: number;
}

interface EntityBase {
    id: number;
    team: Team;
    x: number;
    z: number;
    radius: number;
    hp: number;
    maxHp: number;
    flying: boolean;
    building: boolean;
    targetId: number | null;
}

export interface Tower extends EntityBase {
    kind: 'tower';
    tower: 'princess' | 'king';
    active: boolean;
    destroyed: boolean;
    cooldown: number;
}

export interface Unit extends EntityBase {
    kind: 'unit';
    card: string;
    deploy: number;
    cooldown: number;
    windup: number;
    stun: number;
    facing: 1 | -1;
    moving: boolean;
}

export interface Projectile {
    id: number;
    team: Team;
    source: string;
    sourceId: number;
    targetId: number;
    x: number;
    z: number;
    tx: number;
    tz: number;
    speed: number;
    damage: number;
    splash: number;
}

export interface Spell {
    id: number;
    team: Team;
    card: string;
    x: number;
    z: number;
    ticks: number;
}

export type MatchEvent =
    | { type: 'play'; team: Team; card: string; x: number; z: number }
    | { type: 'rejected'; team: Team; card: string; reason: string }
    | { type: 'spawn'; id: number; card: string; team: Team }
    | { type: 'ready'; id: number }
    | { type: 'windup'; id: number; targetId: number }
    | { type: 'attack'; id: number; targetId: number }
    | { type: 'hit'; id: number; amount: number; source: string }
    | { type: 'impact'; id: number; x: number; z: number }
    | { type: 'spell'; id: number; card: string; team: Team; x: number; z: number }
    | { type: 'death'; id: number; card: string; team: Team; x: number; z: number }
    | { type: 'tower-down'; id: number; team: Team; tower: 'princess' | 'king' }
    | { type: 'king-awake'; team: Team }
    | { type: 'overtime' }
    | { type: 'end'; winner: Team | null; reason: string };

export interface MatchResult {
    winner: Team | null;
    reason: 'king' | 'time' | 'overtime' | 'tiebreak' | 'draw';
    tick: number;
}

export interface MatchState {
    version: number;
    seed: string;
    tick: number;
    phase: 'regular' | 'overtime' | 'ended';
    result: MatchResult | null;
    nextId: number;
    players: [Player, Player];
    towers: Tower[];
    units: Unit[];
    projectiles: Projectile[];
    spells: Spell[];
    events: MatchEvent[];
}

export function homeSign(team: Team): 1 | -1;
export function createMatch(setup: { seed: string | number; decks: [string[], string[]] }, options?: { towers?: boolean }): MatchState;
export function canDeployAt(state: MatchState, team: Team, x: number, z: number): boolean;
export function validatePlay(state: MatchState, play: Play): string | null;
export function spawnCard(state: MatchState, team: Team, cardId: string, x: number, z: number): Unit[];
export function stepMatch(state: MatchState, plays?: Play[]): MatchState;
export function isMatchOver(state: MatchState): boolean;
export function elixirRate(state: MatchState): number;
export function hashState(state: MatchState): number;
export function waypoint(unit: Unit, dest: { x: number; z: number }): { x: number; z: number };

export interface Bot {
    rng: { s: number };
    reaction: [number, number];
    wait: number;
}
export function createBot(seed: string | number, options?: { reaction?: [number, number] }): Bot;
export function botPlay(state: MatchState, team: Team, bot: Bot): Play | null;

export interface SimulatedMatch {
    result: MatchResult;
    plays: (Play & { tick: number })[];
    state: MatchState;
    played: [Record<string, number>, Record<string, number>];
    damageByCard: [Record<string, number>, Record<string, number>];
}
export function simulateMatch(setup: { seed: string | number; decks: [string[], string[]] }, options?: { onTick?: (state: MatchState) => void }): SimulatedMatch;
export function replayMatch(setup: { seed: string | number; decks: [string[], string[]]; plays: (Play & { tick: number })[] }): MatchState;
