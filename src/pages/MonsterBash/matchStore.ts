import {
  TICK_RATE,
  type FightEvent,
  type FightFrame,
  type FighterSide,
  type OddsPoint,
} from "../../../server/shared/monster-bash/index.js";

// Spectators watch slightly behind the feed so late-arriving chunks never
// stall the arena. The server streams in real time; we play this far back.
export const PLAYBACK_DELAY_MS = 1500;

export type MatchInfo = {
  id: string;
  fighters: [string, string];
  /** Epoch ms when tick 0 of the fight happens on the feed's clock. */
  fightStartsAt: number;
  /** Betting closes as the fight starts; absent in the local preview. */
  bettingClosesAt?: number;
  /** sha256 of the secret seed, published before the fight for verification. */
  seedHash?: string;
  /** Coins staked on each side; absent in the local preview. */
  pools?: BetPools;
};

export type BetPools = {
  /** Coins players have bet on each side. */
  amounts: [number, number];
  bettors: [number, number];
  /** The house's stake on each side, split by the pre-fight win chance. */
  house?: [number, number];
};

export type ChatMessage = {
  id: number;
  text: string;
  at: number;
  name?: string;
  /** Announcements from the arena (payouts, refunds). */
  system?: boolean;
};

export type SettlementSummary = {
  settled: number;
  pool: number;
  winningPool: number;
  refunded: boolean;
};

export type MatchResult = {
  winner: FighterSide;
  durationTicks: number;
};

export type MatchChunk = {
  matchId: string;
  frames: FightFrame[];
  events: FightEvent[];
  odds: OddsPoint[];
};

export type FeedMessage =
  | { type: "hello"; serverTime: number; history: FinishedMatch[] }
  | { type: "viewers"; count: number }
  | { type: "match"; match: MatchInfo; odds: OddsPoint[] }
  | { type: "chunk"; chunk: MatchChunk }
  | { type: "result"; matchId: string; result: MatchResult }
  | { type: "pool"; matchId: string; pools: BetPools }
  | { type: "settled"; matchId: string; summary: SettlementSummary }
  | { type: "chat"; message: ChatMessage }
  | { type: "chatHistory"; messages: ChatMessage[] };

export type LiveMatch = MatchInfo & {
  frames: FightFrame[];
  events: FightEvent[];
  odds: OddsPoint[];
  result: MatchResult | null;
};

export type FinishedMatch = {
  id: string;
  fighters: [string, string];
  winner: FighterSide;
};

export type MatchPhase = "waiting" | "intro" | "fighting" | "result";

export type FeedConnection = "connecting" | "live" | "reconnecting" | "local";

type Snapshot = {
  match: LiveMatch | null;
  history: FinishedMatch[];
  viewers: number | null;
  connection: FeedConnection;
  chat: ChatMessage[];
  /** The last bout whose bets were paid out; the page refreshes balances on change. */
  settledMatchId: string | null;
  version: number;
};

const HISTORY_LIMIT = 8;
const CHAT_LIMIT = 100;

// Holds the match being shown. Feeds push messages in; React reads it through
// useSyncExternalStore and the Phaser arena reads it directly every frame.
export class MatchStore {
  private snapshot: Snapshot = {
    match: null,
    history: [],
    viewers: null,
    connection: "connecting",
    chat: [],
    settledMatchId: null,
    version: 0,
  };
  private listeners = new Set<() => void>();
  /** Feed clock minus local clock, so every viewer plays the same moment. */
  clockOffsetMs = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  get match() {
    return this.snapshot.match;
  }

  setConnection(connection: FeedConnection) {
    if (connection !== this.snapshot.connection) this.commit({ connection });
  }

  receive(message: FeedMessage) {
    const current = this.snapshot.match;

    if (message.type === "hello") {
      // Play on the server's clock so every viewer sees the same moment.
      this.clockOffsetMs = message.serverTime - Date.now();
      this.commit({ history: message.history.slice(0, HISTORY_LIMIT) });
      return;
    }

    if (message.type === "viewers") {
      this.commit({ viewers: message.count });
      return;
    }

    if (message.type === "chatHistory") {
      this.commit({ chat: message.messages.slice(-CHAT_LIMIT) });
      return;
    }

    if (message.type === "chat") {
      this.commit({ chat: [...this.snapshot.chat, message.message].slice(-CHAT_LIMIT) });
      return;
    }

    if (message.type === "settled") {
      this.commit({ settledMatchId: message.matchId });
      return;
    }

    if (message.type === "match") {
      const isNewBout = current?.id !== message.match.id;
      const alreadyListed = this.snapshot.history.some((bout) => bout.id === current?.id);
      const history = isNewBout && current?.result && !alreadyListed
        ? [
            {
              id: current.id,
              fighters: current.fighters,
              winner: current.result.winner,
            },
            ...this.snapshot.history,
          ].slice(0, HISTORY_LIMIT)
        : this.snapshot.history;
      this.commit({
        match: {
          ...message.match,
          frames: [],
          events: [],
          odds: [...message.odds],
          result: null,
        },
        history,
      });
      return;
    }

    if (!current) return;

    if (message.type === "chunk" && message.chunk.matchId === current.id) {
      const { frames, events, odds } = message.chunk;
      current.frames.push(...frames);
      current.events.push(...events);
      current.odds.push(...odds);
      this.commit({ match: { ...current } });
      return;
    }

    if (message.type === "pool" && message.matchId === current.id) {
      this.commit({ match: { ...current, pools: message.pools } });
      return;
    }

    if (message.type === "result" && message.matchId === current.id) {
      this.commit({ match: { ...current, result: message.result } });
    }
  }

  /** The fight tick spectators should be seeing right now (may be negative). */
  playbackTick(now = Date.now()) {
    const match = this.snapshot.match;
    if (!match) return 0;
    const elapsed = now + this.clockOffsetMs - match.fightStartsAt - PLAYBACK_DELAY_MS;
    return (elapsed * TICK_RATE) / 1000;
  }

  phase(now = Date.now()): MatchPhase {
    const match = this.snapshot.match;
    if (!match) return "waiting";
    const tick = this.playbackTick(now);
    if (tick < 0) return "intro";
    if (match.result && tick >= match.result.durationTicks) return "result";
    return "fighting";
  }

  private commit(next: Partial<Snapshot>) {
    this.snapshot = {
      ...this.snapshot,
      ...next,
      version: this.snapshot.version + 1,
    };
    this.listeners.forEach((listener) => listener());
  }
}
