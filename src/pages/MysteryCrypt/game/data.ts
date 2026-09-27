// Mystery Crypt's tables: heroes, monsters, moves, who learns what, items and
// stages. The moves and their art come from 8 Bit Evil Returns.

export type HeroId = "joe" | "matt" | "alex" | "jon";
export type MonsterId =
  | "rat" | "imp" | "pumpkin" | "skull" | "zombie" | "candle"
  | "ghost" | "scarecrow" | "werewolf" | "ufo" | "shadowbeast" | "swampthing";
export type UnitKind = HeroId | MonsterId;
export type ItemId = "heart" | "candycorn" | "lamp" | "elixir";
export type MoveId =
  | "fireball" | "lightning" | "boomerang" | "claw" | "crossbow"
  | "cursedsword" | "acid" | "batswarm" | "wisp" | "holycross" | "heartbeat";

export interface Stats {
  hp: number;
  atk: number;
  def: number;
}

// A move it learns at a level.
type Learnset = [level: number, move: MoveId][];

export interface HeroDef extends Stats {
  name: string;
  perk: string;
  recruitBonus: number;
  learns: Learnset;
}

export const HEROES: Record<HeroId, HeroDef> = {
  joe: { name: "Joe", perk: "All-rounder", hp: 34, atk: 7, def: 3, recruitBonus: 1, learns: [[1, "claw"], [3, "fireball"], [6, "boomerang"], [12, "holycross"]] },
  matt: { name: "Matt", perk: "Tough: more HP and defence", hp: 42, atk: 6, def: 4, recruitBonus: 1, learns: [[1, "cursedsword"], [4, "batswarm"], [8, "heartbeat"], [14, "lightning"]] },
  alex: { name: "Alex", perk: "Hits hard from range", hp: 28, atk: 9, def: 2, recruitBonus: 1, learns: [[1, "crossbow"], [3, "boomerang"], [7, "lightning"], [11, "fireball"]] },
  jon: { name: "Jon", perk: "Monsters join him more often", hp: 32, atk: 6, def: 3, recruitBonus: 1.6, learns: [[1, "wisp"], [3, "heartbeat"], [6, "acid"], [10, "holycross"]] },
};

export interface MonsterDef extends Stats {
  name: string;
  // Chance to ask to join when beaten.
  recruit: number;
  learns: Learnset;
}

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  rat: { name: "Rat", hp: 12, atk: 4, def: 1, recruit: 0.2, learns: [[1, "claw"], [8, "acid"]] },
  imp: { name: "Imp", hp: 10, atk: 5, def: 1, recruit: 0.18, learns: [[1, "fireball"], [6, "wisp"]] },
  pumpkin: { name: "Pumpkin", hp: 16, atk: 5, def: 3, recruit: 0.16, learns: [[1, "fireball"], [7, "heartbeat"]] },
  skull: { name: "Skull", hp: 14, atk: 6, def: 2, recruit: 0.15, learns: [[1, "cursedsword"], [5, "wisp"]] },
  zombie: { name: "Zombie", hp: 20, atk: 6, def: 3, recruit: 0.12, learns: [[1, "claw"], [5, "acid"], [10, "cursedsword"]] },
  candle: { name: "Candle", hp: 16, atk: 7, def: 2, recruit: 0.11, learns: [[1, "fireball"], [4, "wisp"], [12, "holycross"]] },
  ghost: { name: "Ghost", hp: 18, atk: 7, def: 3, recruit: 0.09, learns: [[1, "wisp"], [8, "lightning"]] },
  scarecrow: { name: "Scarecrow", hp: 24, atk: 7, def: 4, recruit: 0.08, learns: [[1, "boomerang"], [9, "batswarm"]] },
  werewolf: { name: "Werewolf", hp: 24, atk: 8, def: 3, recruit: 0.06, learns: [[1, "claw"], [6, "batswarm"]] },
  ufo: { name: "UFO", hp: 22, atk: 8, def: 4, recruit: 0.05, learns: [[1, "lightning"], [5, "crossbow"]] },
  shadowbeast: { name: "Shadow Beast", hp: 28, atk: 9, def: 4, recruit: 0.04, learns: [[1, "batswarm"], [8, "cursedsword"]] },
  swampthing: { name: "Swamp Thing", hp: 34, atk: 9, def: 5, recruit: 0.03, learns: [[1, "acid"], [6, "heartbeat"]] },
};

export type MoveShape =
  // First unit in a straight line in front.
  | "line"
  // Every unit in a straight line in front.
  | "pierce"
  // The tile in front.
  | "front"
  // The tile in front and the two beside it.
  | "sweep"
  // Every tile around the user.
  | "around"
  // The nearest monster in sight, wherever it is.
  | "seek"
  // Every monster in sight.
  | "room"
  // The user's team.
  | "heal";

export interface MoveDef {
  name: string;
  about: string;
  // From 8 Bit Evil Returns.
  quote: string;
  shape: MoveShape;
  range: number;
  // Damage multiplier on attack (heal: share of max HP).
  power: number;
  pp: number;
  accuracy: number;
  // Extra: burns/poisons for a few turns, splashes the tiles round the target, or heals the user.
  effect?: "burn" | "poison" | "splash" | "drain";
  icon: string;
  color: string;
}

export const MOVES: Record<MoveId, MoveDef> = {
  claw: { name: "Claw", about: "Slashes the three tiles in front.", quote: "RAWR xD", shape: "sweep", range: 1, power: 1.15, pp: 20, accuracy: 0.95, icon: "claw_skill", color: "#c8b8ff" },
  fireball: { name: "Fireball", about: "Shoots a fireball that bursts on the first monster it hits.", quote: "FLAMIN HOT", shape: "line", range: 6, power: 1.3, pp: 12, accuracy: 0.92, effect: "splash", icon: "fireball_skill", color: "#ff8a1f" },
  boomerang: { name: "Boomerang", about: "Hits every monster in a line, out and back.", quote: "OY MATE!!!", shape: "pierce", range: 4, power: 1.0, pp: 15, accuracy: 0.95, icon: "boomerang_skill", color: "#ffcf4a" },
  crossbow: { name: "CrossBow", about: "A long-range bolt that never misses.", quote: "IT'S HIGH NOOOON", shape: "line", range: 8, power: 1.25, pp: 15, accuracy: 1, icon: "crossbow_skill", color: "#6ae0ff" },
  lightning: { name: "Lightning", about: "Strikes the nearest monster in sight.", quote: "A shocking discovery", shape: "seek", range: 6, power: 1.5, pp: 10, accuracy: 0.9, icon: "lightning_skill", color: "#a8d8ff" },
  cursedsword: { name: "Cursed Sword", about: "A heavy hit in front that steals some health.", quote: "BOOOOO!", shape: "front", range: 1, power: 1.8, pp: 10, accuracy: 0.9, effect: "drain", icon: "cursed_sword_skill", color: "#9a6ad6" },
  acid: { name: "Acid", about: "Throws a flask that poisons where it lands.", quote: "This tastes funny...", shape: "line", range: 5, power: 0.6, pp: 12, accuracy: 0.95, effect: "poison", icon: "acid_skill", color: "#7dff6a" },
  batswarm: { name: "Bat Swarm", about: "Bats bite everything around you.", quote: "JUSTICE!!!!!", shape: "around", range: 1, power: 1.0, pp: 12, accuracy: 0.95, icon: "bat_skill", color: "#8a78b0" },
  wisp: { name: "Will-O-Wisp", about: "Sends a wisp to burn the nearest monster over time.", quote: "WILLY O WISPY", shape: "seek", range: 5, power: 0.5, pp: 12, accuracy: 0.95, effect: "burn", icon: "wisp_skill", color: "#6ae0e0" },
  holycross: { name: "Holy Cross", about: "Smites every monster in sight.", quote: "Have you ever heard of Jumanji?", shape: "room", range: 6, power: 0.9, pp: 6, accuracy: 1, icon: "holy_cross_icon", color: "#ffe08a" },
  heartbeat: { name: "Heartbeat", about: "Heals your whole team a little.", quote: "I LOVED HER!!!!", shape: "heal", range: 0, power: 0.25, pp: 6, accuracy: 1, icon: "heartbeat_icon", color: "#ff5a6a" },
};

export const MAX_MOVES = 4;

export function learnset(kind: UnitKind): Learnset {
  return kind in HEROES ? HEROES[kind as HeroId].learns : MONSTERS[kind as MonsterId].learns;
}

// Moves known at a level, oldest first.
export function knownMoves(kind: UnitKind, level: number): MoveId[] {
  return learnset(kind)
    .filter(([at]) => at <= level)
    .map(([, move]) => move);
}

// The four moves a new unit starts with: the latest it knows.
export function defaultMoves(kind: UnitKind, level: number): MoveId[] {
  return knownMoves(kind, level).slice(-MAX_MOVES);
}

export const ITEMS: Record<ItemId, { name: string; about: string; price: number }> = {
  heart: { name: "Heart", about: "Heals your hero by half.", price: 60 },
  candycorn: { name: "Candy Corn", about: "Throw it at a monster. If you beat it, it's much likelier to join.", price: 90 },
  lamp: { name: "Lantern", about: "Lights up the whole floor, stairs included.", price: 70 },
  elixir: { name: "Elixir", about: "Refills every move's uses for your whole team.", price: 120 },
};

export interface StageDef {
  name: string;
  about: string;
  floors: number;
  // Monster level on the first floor; +1 a floor.
  level: number;
  monsters: MonsterId[];
  // No boss: the last floor's stairs lead out instead.
  boss: MonsterId | null;
  bossName: string;
  // Dungeon colours (index into the renderer's themes).
  theme: number;
}

export const STAGES: StageDef[] = [
  { name: "Graveyard Gate", about: "Rats and imps scratch at the crypt door.", floors: 3, level: 1, monsters: ["rat", "imp"], boss: "rat", bossName: "Rat King", theme: 0 },
  { name: "Pumpkin Cellar", about: "Something is rotting down here.", floors: 4, level: 3, monsters: ["pumpkin", "imp", "skull"], boss: "pumpkin", bossName: "Jack the Gourd", theme: 0 },
  { name: "Zombie Tunnels", about: "Shuffling in the dark.", floors: 4, level: 5, monsters: ["zombie", "skull", "rat"], boss: "zombie", bossName: "Zombie Lord", theme: 1 },
  { name: "Candlelit Chapel", about: "The candles are watching.", floors: 5, level: 7, monsters: ["candle", "ghost", "skull"], boss: "candle", bossName: "Grand Candle", theme: 1 },
  { name: "Haunted Harvest", about: "The fields have teeth.", floors: 5, level: 9, monsters: ["scarecrow", "pumpkin", "ghost"], boss: "scarecrow", bossName: "The Stalk", theme: 2 },
  { name: "Wolf Den", about: "Howling, getting closer.", floors: 6, level: 11, monsters: ["werewolf", "zombie", "candle"], boss: "werewolf", bossName: "Alpha", theme: 2 },
  { name: "Crash Site", about: "Lights in the sky came down here.", floors: 6, level: 13, monsters: ["ufo", "ghost", "werewolf"], boss: "ufo", bossName: "Mothership", theme: 3 },
  { name: "Shadow Vault", about: "Nothing down here casts a shadow.", floors: 7, level: 15, monsters: ["shadowbeast", "ufo", "scarecrow"], boss: "shadowbeast", bossName: "The Umbra", theme: 3 },
  { name: "Swamp of Sorrow", about: "The bottom of the crypt. Or is it?", floors: 8, level: 17, monsters: ["swampthing", "shadowbeast", "werewolf"], boss: "swampthing", bossName: "Bog King", theme: 1 },
];

const ALL_MONSTERS = Object.keys(MONSTERS) as MonsterId[];

// The Prologue's short first dungeon, where you meet Wick.
export const PROLOGUE_STAGE = -1;
const PROLOGUE: StageDef = { name: "Under the Cemetery", about: "Where you landed.", floors: 2, level: 1, monsters: ["rat"], boss: null, bossName: "", theme: 0 };

// Past the last stage, the Abyss goes on forever, a little harder each time.
export function stageDef(index: number): StageDef {
  if (index === PROLOGUE_STAGE) return PROLOGUE;
  if (index < STAGES.length) return STAGES[index];
  const depth = index - STAGES.length + 1;
  return {
    name: `The Abyss ${depth}`,
    about: "No bottom. Every monster, stronger every time.",
    floors: 8,
    level: 18 + depth * 2,
    monsters: ALL_MONSTERS,
    boss: ALL_MONSTERS[(depth * 5) % ALL_MONSTERS.length],
    bossName: "Abyss Warden",
    theme: depth % 4,
  };
}

export function isHero(kind: UnitKind): kind is HeroId {
  return kind in HEROES;
}

export function unitName(kind: UnitKind) {
  return isHero(kind) ? HEROES[kind].name : MONSTERS[kind].name;
}

// Stats grow 15% of the base a level.
export function statsAt(kind: UnitKind, level: number): Stats {
  const base = isHero(kind) ? HEROES[kind] : MONSTERS[kind];
  const k = 1 + 0.15 * (level - 1);
  return { hp: Math.round(base.hp * k), atk: base.atk * k, def: base.def * k };
}
