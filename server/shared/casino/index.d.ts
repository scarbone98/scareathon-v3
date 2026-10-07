// Types for the casino's rules so the React client can import them.

type Rng = () => number;

// Slots
export interface SlotSymbol {
    id: string;
    monster: string;
    weight: number;
    three: number;
    pair: number;
}
export type SlotLine = 'three' | 'pair' | null;

export const SLOT_REELS: number;
export const SLOT_SYMBOLS: SlotSymbol[];
export function spinReels(rng: Rng): string[];
export function slotResult(reels: string[]): { line: SlotLine; multiplier: number };
export function slotReturnToPlayer(): number;

// Roulette
export type RouletteColor = 'green' | 'red' | 'black';
export type RouletteBetType = 'straight' | 'red' | 'black' | 'odd' | 'even' | 'low' | 'high' | 'dozen' | 'column';
export interface RouletteBet {
    type: RouletteBetType;
    value: number | null;
    amount: number;
}

export const ROULETTE_WHEEL: number[];
export const ROULETTE_MAX_BETS: number;
export const ROULETTE_BETS: Record<RouletteBetType, { pays: number; values?: number; wins: (number: number, value: number | null) => boolean }>;
export function rouletteColor(number: number): RouletteColor;
export function rouletteBetKey(bet: Pick<RouletteBet, 'type' | 'value'>): string;
export function parseRouletteBets(raw: unknown, limits: { minBet: number; maxBet: number }): RouletteBet[] | null;
export function spinRoulette(rng: Rng): number;
export function settleRoulette(bets: RouletteBet[], number: number): { payout: number; bets: (RouletteBet & { payout: number })[] };

// Racing
export interface RaceRunner {
    monster: string;
    chance: number;
    odds: number;
}

export const RACE_FIELD: number;
export const RACE_HOUSE_EDGE: number;
export const RACE_MIN_ODDS: number;
export function raceOdds(chance: number): number;
export function racePayout(stake: number, odds: number): number;
export function makeRaceCard(rng: Rng): RaceRunner[];
export function runRace(card: RaceRunner[], rng: Rng): { order: number[]; winner: number; times: number[] };

// Picture poker
export type PokerHandId = 'junk' | 'pair' | 'two_pair' | 'three' | 'full_house' | 'four' | 'five';
export interface PokerHand {
    id: PokerHandId;
    name: string;
    multiplier: number;
}
export type PokerOutcome = 'win' | 'lose';

export const POKER_HAND_SIZE: number;
export const POKER_SYMBOLS: string[];
export const POKER_HANDS: PokerHand[];
export function isPokerCard(card: unknown): boolean;
export function dealCards(rng: Rng, count?: number): string[];
export function evaluateHand(cards: string[]): PokerHand & { rank: number };
export function pokerOutcome(playerCards: string[], dealerCards: string[]): PokerOutcome;
export function pokerPayout(stake: number, playerCards: string[], dealerCards: string[]): number;
export function dealerHolds(cards: string[]): boolean[];
export function drawCards(cards: string[], holds: boolean[], rng: Rng): string[];
export function parseHolds(raw: unknown): boolean[] | null;
