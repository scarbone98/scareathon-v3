// Turning a save into a stage's starting team, and a finished stage back into
// the save. Pure; storing it is store.ts's job.
import { MAX_BAG, MAX_MONSTERS, MAX_TEAM, SAVE_VERSION, type Save, type SavedUnit } from "../../../../server/shared/mysteryCrypt/save.js";
import { defaultMoves, HEROES, knownMoves, MAX_MOVES, type HeroId, type ItemId, type MonsterId, type MoveId, type UnitKind } from "./data.ts";

export type { Save, SavedMonster, SavedUnit } from "../../../../server/shared/mysteryCrypt/save.js";
export { progressScore, sanitizeSave } from "../../../../server/shared/mysteryCrypt/save.js";

export function newSave(): Save {
  const heroes = Object.fromEntries(
    (Object.keys(HEROES) as HeroId[]).map((id) => [id, { level: 1, xp: 0, moves: defaultMoves(id, 1) }])
  ) as Record<HeroId, SavedUnit>;
  return {
    version: SAVE_VERSION,
    hero: "joe",
    heroes,
    monsters: [],
    team: [],
    nextUid: 1,
    candy: 0,
    bag: ["heart", "candycorn"],
    cleared: 0,
    best: [],
    submitted: 0,
  };
}

// One member of the team a stage starts with (or a recruit it ends with).
export interface RosterEntry {
  // Collection id; null for a monster recruited this stage.
  uid: number | null;
  kind: UnitKind;
  level: number;
  xp: number;
  moves: MoveId[];
}

export function startingRoster(save: Save): RosterEntry[] {
  const hero = save.heroes[save.hero];
  const team = save.team
    .map((uid) => save.monsters.find((m) => m.uid === uid))
    .filter((m) => !!m)
    .map((m) => ({ uid: m.uid, kind: m.kind, level: m.level, xp: m.xp, moves: [...m.moves] }));
  return [{ uid: null, kind: save.hero, level: hero.level, xp: hero.xp, moves: [...hero.moves] }, ...team];
}

export interface StageReport {
  stage: number;
  cleared: boolean;
  floor: number;
  candy: number;
  // Everyone who started, levelled up as they finished (fainted or not).
  roster: RosterEntry[];
  // Monsters that joined this stage.
  recruits: RosterEntry[];
  // What's left in the bag (after fainting, without anything found on the way).
  bag: ItemId[];
}

// Moves it knows now but didn't at `was`, added to free slots.
function learnNew(kind: UnitKind, was: number, level: number, moves: MoveId[]) {
  const before = new Set(knownMoves(kind, was));
  const out = [...moves];
  for (const move of knownMoves(kind, level)) {
    if (before.has(move) || out.includes(move) || out.length >= MAX_MOVES) continue;
    out.push(move);
  }
  return out;
}

export function applyReport(save: Save, report: StageReport): Save {
  const next: Save = structuredClone(save);
  const [hero, ...team] = report.roster;
  const savedHero = next.heroes[next.hero];
  next.heroes[next.hero] = { level: hero.level, xp: hero.xp, moves: learnNew(hero.kind, savedHero.level, hero.level, savedHero.moves) };
  for (const member of team) {
    const m = next.monsters.find((o) => o.uid === member.uid);
    if (!m) continue;
    m.moves = learnNew(m.kind, m.level, member.level, m.moves);
    m.level = member.level;
    m.xp = member.xp;
  }
  // Keep everyone you recruited, fainted or not. New ones fill free team slots.
  for (const r of report.recruits) {
    if (next.monsters.length >= MAX_MONSTERS) break;
    const uid = next.nextUid++;
    next.monsters.push({ uid, kind: r.kind as MonsterId, level: r.level, xp: r.xp, moves: [...r.moves] });
    if (next.team.length < MAX_TEAM) next.team.push(uid);
  }
  // Fainting loses the candy found on the way; clearing keeps it.
  next.bag = report.bag.slice(0, MAX_BAG);
  if (report.cleared) {
    next.candy += report.candy;
    if (report.stage === next.cleared) next.cleared++;
  }
  next.best[report.stage] = Math.max(next.best[report.stage] ?? 0, report.floor);
  for (let i = 0; i < next.best.length; i++) next.best[i] ??= 0;
  return next;
}

// ---------- camp actions (each returns a new save, or the same one if not allowed) ----------

export function pickHero(save: Save, hero: HeroId): Save {
  return { ...save, hero };
}

// In or out of the team that goes into the next stage.
export function toggleTeam(save: Save, uid: number): Save {
  if (save.team.includes(uid)) return { ...save, team: save.team.filter((t) => t !== uid) };
  if (save.team.length >= MAX_TEAM || !save.monsters.some((m) => m.uid === uid)) return save;
  return { ...save, team: [...save.team, uid] };
}

// Equips `move` in `slot` (appending if the slot is past the end) for the
// hero (uid null) or a monster, if it knows the move.
export function equipMove(save: Save, uid: number | null, slot: number, move: MoveId): Save {
  const next = structuredClone(save);
  const unit: { level: number; moves: MoveId[] } | undefined = uid === null ? next.heroes[next.hero] : next.monsters.find((m) => m.uid === uid);
  const kind: UnitKind | undefined = uid === null ? next.hero : next.monsters.find((m) => m.uid === uid)?.kind;
  if (!unit || !kind || !knownMoves(kind, unit.level).includes(move)) return save;
  const at = unit.moves.indexOf(move);
  if (at >= 0) {
    // Already equipped: swap the two slots.
    [unit.moves[at], unit.moves[slot]] = [unit.moves[slot], unit.moves[at]];
    unit.moves = unit.moves.filter((m) => !!m);
  } else if (slot < unit.moves.length) {
    unit.moves[slot] = move;
  } else if (unit.moves.length < MAX_MOVES) {
    unit.moves.push(move);
  }
  return next;
}

export function buyItem(save: Save, item: ItemId, price: number): Save {
  if (save.candy < price || save.bag.length >= MAX_BAG) return save;
  return { ...save, candy: save.candy - price, bag: [...save.bag, item] };
}

export function releaseMonster(save: Save, uid: number): Save {
  return { ...save, monsters: save.monsters.filter((m) => m.uid !== uid), team: save.team.filter((t) => t !== uid) };
}
