// What Frog Ball remembers on this device: the ranking table, settings,
// how far you've got, and your best time on each stage.
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; fine.
  }
}

export interface RankEntry {
  name: string;
  score: number;
  stage: string;
}

const RANK_KEY = "frog-ball-ranking";
export const RANK_SIZE = 10;

// An arcade table is never empty.
const DEFAULT_RANKING: RankEntry[] = [
  ["FRG", 60000, "4-1"],
  ["LIL", 50000, "3-2"],
  ["PAD", 40000, "3-1"],
  ["HOP", 30000, "2-3"],
  ["RIB", 25000, "2-2"],
  ["BIT", 20000, "2-1"],
  ["FLY", 15000, "1-3"],
  ["POG", 10000, "1-3"],
  ["TAD", 5000, "1-2"],
  ["ZZZ", 2000, "1-1"],
].map(([name, score, stage]) => ({ name: name as string, score: score as number, stage: stage as string }));

export function loadRanking(): RankEntry[] {
  const r = load<{ list: RankEntry[] }>(RANK_KEY, { list: DEFAULT_RANKING }).list;
  return [...r].sort((a, b) => b.score - a.score).slice(0, RANK_SIZE);
}

// Where a score would land in the table, or -1 if it doesn't make it.
export function rankFor(score: number) {
  if (score <= 0) return -1;
  const r = loadRanking();
  const i = r.findIndex((e) => score > e.score);
  return i === -1 ? (r.length < RANK_SIZE ? r.length : -1) : i;
}

export function addRanking(entry: RankEntry) {
  const r = [...loadRanking(), entry].sort((a, b) => b.score - a.score).slice(0, RANK_SIZE);
  save(RANK_KEY, { list: r });
  return r.indexOf(entry);
}

export interface Settings {
  sound: boolean;
  lastName: string;
}

const SETTINGS_KEY = "frog-ball-settings";
export const loadSettings = () => load<Settings>(SETTINGS_KEY, { sound: true, lastName: "AAA" });
export const saveSettings = (s: Settings) => save(SETTINGS_KEY, s);

const PROGRESS_KEY = "frog-ball-progress";
interface Progress {
  reached: number;
  best: Record<string, number>; // stage id -> fastest clear in seconds
  lastScore: number;
}
export const loadProgress = () => load<Progress>(PROGRESS_KEY, { reached: 0, best: {}, lastScore: 0 });
export const saveProgress = (p: Progress) => save(PROGRESS_KEY, p);

export const ordinal = (n: number) => `${n}${n === 1 ? "ST" : n === 2 ? "ND" : n === 3 ? "RD" : "TH"}`;
