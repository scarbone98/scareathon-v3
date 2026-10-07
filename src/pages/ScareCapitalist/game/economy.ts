// Scare Capitalist's economy: the ventures, their funding rounds, managers, term sheets and
// Phantom Investors, and every formula the game runs on. Pure data and functions, no React,
// so the balance bot (bot.ts) can run it headless in node.
//
// The formulas, for venture i with n owned:
//   price of the next unit      cost0 · rate^n
//   price of the next k units   cost0 · rate^n · (rate^k − 1) / (rate − 1)        (geometric sum)
//   most units cash c buys      floor( log_rate( 1 + c·(rate − 1) / (cost0 · rate^n) ) )
//   payout per cycle            rev0 · n · roundsProfit · termSheets · portfolio · investors
//   cycle time                  time0 / (roundsSpeed · portfolioSpeed)
//   investors' bonus            1 + investors held × 2% (more with séances)
//   investors earned in all     floor( 150 · ∛(lifetime earnings / 1e13) )
// A venture with a manager runs cycle after cycle by itself, offline too; without one,
// every cycle has to be started by tapping it.

export type VentureDef = {
  id: string;
  name: string;
  sprite: string;
  cost0: number;
  rate: number;
  time0: number;
  rev0: number;
  // Who runs it once hired, and what they ask for
  manager: { name: string; sprite: string; cost: number };
};

// Each tier costs ~13-15x the last, takes 2.5-4x as long and pays back its first unit
// more slowly (2.5s for candy corn, 5000s for UFOs), but its price climbs more gently
// (rate) so the big ones win when you own hundreds.
export const VENTURES: VentureDef[] = [
  { id: "corn", name: "Candy Corn Cart", sprite: "candycorn", cost0: 4, rate: 1.07, time0: 1, rev0: 1.5, manager: { name: "Joe", sprite: "joe", cost: 800 } },
  { id: "gum", name: "Gumball Graveyard", sprite: "gum", cost0: 70, rate: 1.15, time0: 3, rev0: 42, manager: { name: "Matt", sprite: "matt", cost: 12e3 } },
  { id: "rat", name: "Rat Courier Co.", sprite: "rat", cost0: 900, rate: 1.14, time0: 8, rev0: 600, manager: { name: "Alex", sprite: "alex", cost: 90e3 } },
  { id: "pumpkin", name: "Pumpkin Patch REIT", sprite: "pumpkin", cost0: 11e3, rate: 1.13, time0: 20, rev0: 7.3e3, manager: { name: "Jon", sprite: "jon", cost: 600e3 } },
  { id: "candle", name: "Cursed Candle Co.", sprite: "candle", cost0: 140e3, rate: 1.12, time0: 60, rev0: 105e3, manager: { name: "The Scarecrow", sprite: "scarecrow", cost: 4e6 } },
  { id: "imp", name: "Imp Call Center", sprite: "imp", cost0: 1.8e6, rate: 1.11, time0: 180, rev0: 1.35e6, manager: { name: "Mr. Bones", sprite: "skull", cost: 30e6 } },
  { id: "ghost", name: "Haunted Airbnb", sprite: "ghost", cost0: 24e6, rate: 1.1, time0: 600, rev0: 18e6, manager: { name: "Swamp Thing", sprite: "swampthing", cost: 300e6 } },
  { id: "zombie", name: "Zombie Gig Economy", sprite: "zombie", cost0: 330e6, rate: 1.09, time0: 1800, rev0: 238e6, manager: { name: "Shadow Beast", sprite: "shadowbeast", cost: 3e9 } },
  { id: "wolf", name: "Werewolf Security", sprite: "werewolf", cost0: 4.6e9, rate: 1.08, time0: 5400, rev0: 3.1e9, manager: { name: "Count Crow", sprite: "crow", cost: 35e9 } },
  { id: "ufo", name: "UFO Abductions Inc.", sprite: "ufo", cost0: 66e9, rate: 1.07, time0: 21600, rev0: 57e9, manager: { name: "Madame Comet", sprite: "comet", cost: 500e9 } },
];

// ---- Funding rounds: milestones on how many of one venture you own -----------------------

export type Round = { at: number; name: string; speed: number; profit: number };

// Hand-placed through 500 (six speed doublings and four profit rounds), then a follow-on
// every 100 to 1000 (the Unicorn at 1000 is x4) and every 250 after that, each doubling
// profit.
const EARLY_ROUNDS: Round[] = [
  { at: 10, name: "Seed", speed: 1, profit: 2 },
  { at: 25, name: "Series A", speed: 2, profit: 1 },
  { at: 50, name: "Series B", speed: 2, profit: 1 },
  { at: 100, name: "Series C", speed: 2, profit: 1 },
  { at: 150, name: "Series D", speed: 1, profit: 2 },
  { at: 200, name: "Series E", speed: 2, profit: 1 },
  { at: 250, name: "Mezzanine", speed: 1, profit: 3 },
  { at: 300, name: "Bridge Round", speed: 2, profit: 1 },
  { at: 400, name: "Pre-IPO", speed: 2, profit: 1 },
  { at: 500, name: "IPO", speed: 1, profit: 4 },
];
export const MAX_ROUND = 10000;
export const ROUNDS: Round[] = (() => {
  const list = [...EARLY_ROUNDS];
  for (let at = 600; at <= MAX_ROUND; at += at < 1000 ? 100 : 250) {
    const name = at === 1000 ? "Unicorn" : at === 2000 ? "Decacorn" : at === 5000 ? "Hectocorn" : at < 1000 ? "Follow-on" : "Secondary";
    list.push({ at, name, speed: 1, profit: at === 1000 ? 4 : 2 });
  }
  return list;
})();

export function roundAfter(owned: number): Round | null {
  return ROUNDS.find((r) => r.at > owned) ?? null;
}

// The combined speed and profit of every round passed with `owned` units.
export function roundsBonus(owned: number) {
  let speed = 1;
  let profit = 1;
  for (const r of ROUNDS) {
    if (owned < r.at) break;
    speed *= r.speed;
    profit *= r.profit;
  }
  return { speed, profit };
}

// ---- Portfolio rounds: when every venture has at least N ---------------------------------

export const PORTFOLIO_STEPS = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
export function portfolioBonus(minOwned: number) {
  let speed = 1;
  let profit = 1;
  for (const at of PORTFOLIO_STEPS) {
    if (minOwned < at) break;
    if (at <= 100) speed *= 2;
    else profit *= 2;
  }
  return { speed, profit };
}
export function nextPortfolio(minOwned: number) {
  return PORTFOLIO_STEPS.find((at) => at > minOwned) ?? null;
}

// ---- Term sheets: cash upgrades -------------------------------------------------------

export type Upgrade = { id: string; name: string; cost: number; target: number | "all"; x: number };

// Ten ladders, one per venture, and an "everything" sheet at the top of each rung, each
// one doubling profit. A rung costs 10^4.5 times the one before (about 31,600x), and
// within a rung the sheets get pricier down the ventures. A rung all but quadruples
// income for 31,600x the money (about cash^0.13), slow enough that a run still levels
// off and the investors are worth going back for.
const SHEET_NAMES = ["Pitch Deck", "Term Sheet", "Board Seat", "Golden Parachute", "Poison Pill", "Blood Oath", "Soul Contract", "Eldritch Merger", "Dark Pool", "Void Fund", "Necro-SPAC", "Crypt-o Coin", "Lich Buyout", "Abyssal Audit", "The Final Exit"];
const ROMAN = ["", " II", " III", " IV", " V"];
export const UPGRADE_RUNGS = 30;
export const UPGRADES: Upgrade[] = (() => {
  const list: Upgrade[] = [];
  for (let rung = 0; rung < UPGRADE_RUNGS; rung++) {
    const base = 2.5e5 * Math.pow(10, 4.5 * rung);
    const sheet = SHEET_NAMES[rung % SHEET_NAMES.length] + ROMAN[Math.floor(rung / SHEET_NAMES.length)];
    VENTURES.forEach((v, i) => {
      list.push({ id: `${v.id}-${rung}`, name: `${sheet}: ${v.name}`, cost: base * Math.pow(2.6, i), target: i, x: 2 });
    });
    list.push({ id: `all-${rung}`, name: `${sheet}: Everything`, cost: base * Math.pow(2.6, 10) * 2, target: "all", x: 2 });
  }
  return list.sort((a, b) => a.cost - b.cost);
})();
const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));

// ---- Phantom Investors (prestige) -------------------------------------------------------

export const INVESTOR_SCALE = 150;
export const INVESTOR_UNIT = 1e13;
export const INVESTOR_BONUS = 0.02;

// Investors earned over every run, given all the money ever made. A cube root, not
// AdVenture Capitalist's square root: with a square root each run's investors more than
// paid for the next run, and the bot ran away to 10^60 in an afternoon. With a cube root,
// doubling the bonus takes 8x the lifetime earnings and runs stretch out.
export function investorsFor(lifetime: number) {
  return Math.floor(INVESTOR_SCALE * Math.cbrt(Math.max(0, lifetime) / INVESTOR_UNIT));
}
// Lifetime earnings it takes to have earned `investors` in all
export function lifetimeFor(investors: number) {
  return INVESTOR_UNIT * Math.pow(investors / INVESTOR_SCALE, 3);
}

// Séances: spent with investors (who then stop counting toward the bonus)
export type Seance = { id: string; name: string; cost: number; kind: "profit" | "bonus" | "start"; x: number };
export const SEANCES: Seance[] = [
  { id: "s0", name: "Ouija Board Meeting", cost: 100, kind: "start", x: 1 },
  { id: "s1", name: "Whispering Board", cost: 1e3, kind: "profit", x: 3 },
  { id: "s2", name: "Ectoplasm Dividends", cost: 1e4, kind: "bonus", x: 0.01 },
  { id: "s3", name: "Graveside Shareholders", cost: 1e5, kind: "profit", x: 3 },
  { id: "s4", name: "Haunted Hedge Fund", cost: 1e6, kind: "start", x: 2 },
  { id: "s5", name: "Spirit Proxy Votes", cost: 1e7, kind: "bonus", x: 0.01 },
  { id: "s6", name: "Afterlife Annuities", cost: 1e8, kind: "profit", x: 5 },
  { id: "s7", name: "Ghost Writer IPO", cost: 1e10, kind: "profit", x: 9 },
  { id: "s8", name: "Eternal Board of Directors", cost: 1e12, kind: "bonus", x: 0.02 },
];

// ---- State -------------------------------------------------------------------------------

export type VentureState = { owned: number; progress: number; running: boolean; managed: boolean };

export type State = {
  v: 1;
  cash: number;
  // Earned this run, and over all runs
  runEarned: number;
  lifetime: number;
  investors: number; // held, each worth INVESTOR_BONUS
  investorsClaimed: number; // ever received; investorsFor(lifetime) − this can be claimed
  ventures: VentureState[];
  upgrades: string[];
  seances: string[];
  savedAt: number;
  runStartedAt: number;
  resets: number;
};

export function newState(prev?: State): State {
  const seances = prev?.seances ?? [];
  const start = startBonus(seances);
  return {
    v: 1,
    cash: start.cash,
    runEarned: 0,
    lifetime: prev?.lifetime ?? 0,
    investors: prev?.investors ?? 0,
    investorsClaimed: prev?.investorsClaimed ?? 0,
    ventures: VENTURES.map((_, i) => ({ owned: i === 0 ? 1 : 0, progress: 0, running: false, managed: i < start.managers })),
    upgrades: [],
    seances,
    savedAt: Date.now(),
    runStartedAt: Date.now(),
    resets: (prev?.resets ?? -1) + 1,
  };
}

// Ouija Board Meeting: start each run with Joe hired; Haunted Hedge Fund: and $1M
function startBonus(seances: string[]) {
  const has = (id: string) => seances.includes(id);
  return { managers: has("s0") ? 1 : 0, cash: has("s4") ? 1e6 : 0 };
}

// ---- Multipliers ---------------------------------------------------------------------------

export function investorBonus(s: State) {
  let per = INVESTOR_BONUS;
  for (const id of s.seances) {
    const se = SEANCES.find((x) => x.id === id);
    if (se?.kind === "bonus") per += se.x;
  }
  return { per, mult: 1 + s.investors * per };
}

function seanceProfit(s: State) {
  let m = 1;
  for (const id of s.seances) {
    const se = SEANCES.find((x) => x.id === id);
    if (se?.kind === "profit") m *= se.x;
  }
  return m;
}

function upgradeProfit(s: State, i: number) {
  let m = 1;
  for (const id of s.upgrades) {
    const u = UPGRADE_BY_ID.get(id);
    if (u && (u.target === "all" || u.target === i)) m *= u.x;
  }
  return m;
}

export function minOwned(s: State) {
  return Math.min(...s.ventures.map((v) => v.owned));
}

export type VentureStats = { time: number; payout: number; perSec: number; profitMult: number; speedMult: number };

export function ventureStats(s: State, i: number): VentureStats {
  const def = VENTURES[i];
  const owned = s.ventures[i].owned;
  const rounds = roundsBonus(owned);
  const port = portfolioBonus(minOwned(s));
  const speedMult = rounds.speed * port.speed;
  const profitMult = rounds.profit * port.profit * upgradeProfit(s, i) * seanceProfit(s) * investorBonus(s).mult;
  const time = def.time0 / speedMult;
  const payout = def.rev0 * owned * profitMult;
  return { time, payout, perSec: owned > 0 ? payout / time : 0, profitMult, speedMult };
}

// What the managed ventures earn a second (unmanaged ones only count while you tap them)
export function incomePerSec(s: State, onlyManaged = true) {
  let total = 0;
  for (let i = 0; i < VENTURES.length; i++) {
    if (onlyManaged && !s.ventures[i].managed) continue;
    total += ventureStats(s, i).perSec;
  }
  return total;
}

// ---- Buying ------------------------------------------------------------------------------

// Price of the next k units of venture i with n owned (a geometric series)
export function bulkCost(i: number, n: number, k: number) {
  const { cost0, rate } = VENTURES[i];
  if (k <= 0) return 0;
  return (cost0 * Math.pow(rate, n) * (Math.pow(rate, k) - 1)) / (rate - 1);
}

// Most units of venture i the cash buys with n owned
export function maxAffordable(i: number, n: number, cash: number) {
  const { cost0, rate } = VENTURES[i];
  const first = cost0 * Math.pow(rate, n);
  if (!(cash >= first)) return 0;
  let k = Math.floor(Math.log(1 + (cash * (rate - 1)) / first) / Math.log(rate));
  // Floating point at the edges: step down until it's really affordable
  while (k > 0 && bulkCost(i, n, k) > cash) k--;
  return k;
}

export type BuyMode = 1 | 10 | 100 | "next" | "max";
export const BUY_MODES: BuyMode[] = [1, 10, 100, "next", "max"];

// How many a buy button buys in this mode, and for how much. "max" with nothing
// affordable still shows the price of one.
export function buyQuote(s: State, i: number, mode: BuyMode) {
  const n = s.ventures[i].owned;
  let k: number;
  if (mode === "max") k = Math.max(1, maxAffordable(i, n, s.cash));
  else if (mode === "next") k = (roundAfter(n)?.at ?? n + 1) - n;
  else k = mode;
  return { k, cost: bulkCost(i, n, k) };
}

export function buy(s: State, i: number, mode: BuyMode) {
  const { k, cost } = buyQuote(s, i, mode);
  if (!(cost <= s.cash) || !Number.isFinite(cost)) return false;
  s.cash -= cost;
  s.ventures[i].owned += k;
  return true;
}

export function hireManager(s: State, i: number) {
  const cost = VENTURES[i].manager.cost;
  if (s.ventures[i].managed || s.cash < cost || s.ventures[i].owned === 0) return false;
  s.cash -= cost;
  s.ventures[i].managed = true;
  return true;
}

export function buyUpgrade(s: State, id: string) {
  const u = UPGRADE_BY_ID.get(id);
  if (!u || s.upgrades.includes(id) || s.cash < u.cost) return false;
  s.cash -= u.cost;
  s.upgrades.push(id);
  return true;
}

export function buySeance(s: State, id: string) {
  const se = SEANCES.find((x) => x.id === id);
  if (!se || s.seances.includes(id) || s.investors < se.cost) return false;
  s.investors -= se.cost;
  s.seances.push(id);
  return true;
}

// ---- Time --------------------------------------------------------------------------------

function earn(s: State, amount: number) {
  s.cash = Math.min(Number.MAX_VALUE, s.cash + amount);
  s.runEarned = Math.min(Number.MAX_VALUE, s.runEarned + amount);
  s.lifetime = Math.min(Number.MAX_VALUE, s.lifetime + amount);
}

// Tapping a venture starts its cycle
export function start(s: State, i: number) {
  const v = s.ventures[i];
  if (v.owned === 0 || v.running) return false;
  v.running = true;
  return true;
}

// Advance dt seconds. Returns what each venture paid out, for the floating numbers.
export function tick(s: State, dt: number): number[] {
  const paid = VENTURES.map(() => 0);
  for (let i = 0; i < VENTURES.length; i++) {
    const v = s.ventures[i];
    if (v.owned === 0) continue;
    if (v.managed) v.running = true;
    if (!v.running) continue;
    const st = ventureStats(s, i);
    v.progress += dt / st.time;
    if (v.progress < 1) continue;
    // Managed: every whole cycle that fit pays; tapped: just the one, then it waits
    const cycles = v.managed ? Math.floor(v.progress) : 1;
    v.progress = v.managed ? v.progress - cycles : 0;
    if (!v.managed) v.running = false;
    paid[i] = st.payout * cycles;
    earn(s, paid[i]);
  }
  return paid;
}

// Coming back after being away: managed ventures kept working (up to a week), and an
// unmanaged venture that was mid-cycle finished that cycle.
export const OFFLINE_CAP = 7 * 24 * 3600;
export function catchUp(s: State, now = Date.now()) {
  const away = Math.min(OFFLINE_CAP, Math.max(0, (now - s.savedAt) / 1000));
  const before = s.cash;
  if (away > 1) tick(s, away);
  s.savedAt = now;
  return { away, earned: s.cash - before };
}

// ---- Prestige ----------------------------------------------------------------------------

export function claimableInvestors(s: State) {
  return Math.max(0, investorsFor(s.lifetime) - s.investorsClaimed);
}

// Start over with the new investors; séances and lifetime earnings stay
export function haunt(s: State): State {
  const gained = claimableInvestors(s);
  const next = newState({ ...s, investors: s.investors + gained, investorsClaimed: s.investorsClaimed + gained });
  return next;
}

// ---- Saving --------------------------------------------------------------------------------

// Stamps the state too: catchUp pays from savedAt, so it has to be the last save
export function serialize(s: State) {
  s.savedAt = Date.now();
  return JSON.stringify(s);
}

export function deserialize(text: string | null): State | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as State;
    if (raw?.v !== 1 || !Array.isArray(raw.ventures)) return null;
    const fresh = newState();
    raw.ventures = VENTURES.map((_, i) => ({ ...fresh.ventures[i], ...(raw.ventures[i] ?? {}) }));
    for (const k of ["cash", "runEarned", "lifetime", "investors", "investorsClaimed"] as const) {
      if (!Number.isFinite(raw[k]) || raw[k] < 0) raw[k] = 0;
    }
    return raw;
  } catch {
    return null;
  }
}
