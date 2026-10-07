// A greedy player for balancing Scare Capitalist headless. It buys whatever adds the most
// income per dollar, taps unmanaged ventures at a fraction of their speed (a person
// can't tap them all), and haunts once that would at least double its investors' bonus.
// Run: npx esbuild src/pages/ScareCapitalist/game/bot.ts --bundle --platform=node --outfile=/tmp/scbot.js && node /tmp/scbot.js [days]
import {
  UPGRADES, VENTURES, buy, bulkCost, buyUpgrade, claimableInvestors, haunt, hireManager, incomePerSec,
  investorBonus, newState, roundAfter, SEANCES, buySeance, type State,
} from "./economy";
import { formatMoney } from "./format";

const TAP_EFFICIENCY = 0.3;

function income(s: State) {
  return incomePerSec(s, true) + (incomePerSec(s, false) - incomePerSec(s, true)) * TAP_EFFICIENCY;
}

type Action = { cost: number; gain: number; run: (s: State) => boolean; label: string };

function clone(s: State): State {
  return { ...s, ventures: s.ventures.map((v) => ({ ...v })), upgrades: [...s.upgrades], seances: [...s.seances] };
}

function gainOf(s: State, act: (t: State) => void) {
  const t = clone(s);
  t.cash = Number.MAX_VALUE;
  act(t);
  return income(t) - income(s);
}

function actions(s: State): Action[] {
  const out: Action[] = [];
  VENTURES.forEach((v, i) => {
    const n = s.ventures[i].owned;
    if (n === 0 && i > 0 && s.ventures[i - 1].owned === 0) return;
    const one = bulkCost(i, n, 1);
    out.push({ cost: one, gain: gainOf(s, (t) => buy(t, i, 1)), run: (t) => buy(t, i, 1), label: `${v.id}+1` });
    const next = roundAfter(n);
    if (next && next.at - n > 1 && next.at - n <= 150) {
      out.push({ cost: bulkCost(i, n, next.at - n), gain: gainOf(s, (t) => buy(t, i, "next")), run: (t) => buy(t, i, "next"), label: `${v.id}->${next.at}` });
    }
    if (!s.ventures[i].managed && n > 0) {
      out.push({ cost: v.manager.cost, gain: gainOf(s, (t) => hireManager(t, i)), run: (t) => hireManager(t, i), label: `mgr ${v.id}` });
    }
  });
  const nextUps = UPGRADES.filter((u) => !s.upgrades.includes(u.id)).slice(0, 4);
  for (const u of nextUps) out.push({ cost: u.cost, gain: gainOf(s, (t) => buyUpgrade(t, u.id)), run: (t) => buyUpgrade(t, u.id), label: u.id });
  return out.filter((a) => a.gain > 0 && Number.isFinite(a.cost));
}

const days = Number(process.argv[2]) || 30;
const noHaunt = process.argv.includes("nohaunt");
const END = days * 86400;
let s = newState();
let t = 0;
const firsts = new Map<string, number>();
const mark = (key: string, extra = "") => { if (!firsts.has(key)) { firsts.set(key, t); console.log(`${hms(t).padStart(8)}  first ${key}${extra}`); } };
const hms = (sec: number) => sec < 3600 ? `${(sec / 60).toFixed(1)}m` : sec < 86400 ? `${(sec / 3600).toFixed(2)}h` : `${(sec / 86400).toFixed(2)}d`;
const log: string[] = [];
let lastReport = 0;
let steps = 0;

while (t < END) {
  // Spend investors on séances the moment that leaves the bonus at least as high
  for (const se of SEANCES) {
    if (!s.seances.includes(se.id) && s.investors >= se.cost * 20) buySeance(s, se.id);
  }
  const acts = actions(s);
  let best: Action | null = null;
  let bestScore = 0;
  const inc = Math.max(income(s), 1e-9);
  for (const a of acts) {
    // Payback counting the wait to afford it
    const wait = Math.max(0, (a.cost - s.cash) / inc);
    const score = 1 / (a.cost / a.gain + wait);
    if (score > bestScore) { bestScore = score; best = a; }
  }
  if (++steps % 200000 === 0) console.log(steps, hms(t), best?.label, formatMoney(s.cash), formatMoney(income(s)));
  if (!best) { t += 60; continue; }
  const wait = Math.max(0, (best.cost - s.cash) / inc);
  const dt = wait;
  const earned = inc * dt;
  s.cash += earned; s.runEarned += earned; s.lifetime += earned;
  t += dt;
  best.run(s);
  s.ventures.forEach((v, i) => { if (v.owned > 0) mark(`own ${VENTURES[i].id}`); if (v.managed) mark(`mgr ${VENTURES[i].id}`); });
  for (let e = 3; e <= 300; e += 3) if (s.lifetime >= 10 ** e) mark(`lifetime 1e${e}`, ` (${formatMoney(income(s))}/s, investors ${s.investors.toLocaleString()})`);
  const claim = claimableInvestors(s);
  const bonusNow = investorBonus(s).mult;
  if (!noHaunt && claim > 0 && 1 + (s.investors + claim) * investorBonus(s).per >= bonusNow * 2 && (s.resets > 0 || claim >= 100)) {
    console.log(`${hms(t).padStart(8)}  haunt #${s.resets + 1}: +${claim.toLocaleString()} investors (had ${s.investors.toLocaleString()}), run earned ${formatMoney(s.runEarned)}, ${formatMoney(income(s))}/s`);
    s = haunt(s);
  }
  if (t - lastReport > 86400) {
    lastReport = t;
    console.log(`${hms(t).padStart(8)}  day mark: ${formatMoney(income(s))}/s, investors ${s.investors.toLocaleString()}, lifetime ${formatMoney(s.lifetime)}, min owned ${Math.min(...s.ventures.map((v) => v.owned))}`);
  }
}

console.log("Firsts:");
for (const [k, v] of firsts) console.log(`  ${hms(v).padStart(8)}  ${k}`);
console.log("\nTimeline:");
for (const l of log) console.log(l);
console.log(`\nEnd ${days}d: investors ${s.investors.toLocaleString()} (claimed ${s.investorsClaimed.toLocaleString()}), lifetime ${formatMoney(s.lifetime)}, resets ${s.resets}, seances ${s.seances.join(",")}`);
