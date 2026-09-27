// Mystery Crypt's story: the maps it happens on, who speaks, and the scripts.
// A script is a list of steps the controller plays one at a time. Actors are
// named by id: heroes by name ("alex"), the partner "wick", the camp's
// residents by their prop id, and a stage's boss "boss".
import type { HeroId, MonsterId } from "./data.ts";
import type { MapDef, Prop } from "./sim.ts";
import { hasFlag, type Save } from "./save.ts";

export type Step =
  | { say: string; text: string }
  // Everyone listed walks to their spot at once ("beside-alex" for next to Alex).
  | { walk: Record<string, [number, number] | "beside-alex"> }
  | { place: string; at: [number, number] }
  | { face: string; dir: "left" | "right" | "up" | "down" }
  | { emote: string; icon: "!" | "?" | "♥" | "..." | "♪" }
  | { wait: number }
  | { shake: number }
  | { fade: "out" | "in" }
  | { prop: Prop }
  | { card: string; sub?: string };

export interface Speaker {
  name: string;
  color: string;
  // A unit sprite, or one of the renderer's prop sprites.
  kind?: HeroId | MonsterId;
  sprite?: string;
}

export const SPEAKERS: Record<string, Speaker> = {
  narrator: { name: "", color: "#c8b8ff" },
  alex: { name: "Alex", color: "#ffcf4a", kind: "alex" },
  joe: { name: "Joe", color: "#7dffb0", kind: "joe" },
  matt: { name: "Matt", color: "#ff8a8a", kind: "matt" },
  jon: { name: "Jon", color: "#6ae0ff", kind: "jon" },
  wick: { name: "Wick", color: "#ffb86a", kind: "candle" },
  snail: { name: "Snail King", color: "#a8d8b0", sprite: "snail_king" },
  merchant: { name: "Merchant", color: "#9a9aff", sprite: "merchant" },
  owl: { name: "Owl", color: "#ffcf8a", sprite: "owl_tree" },
  boss: { name: "Rat King", color: "#ff6a6a", kind: "rat" },
};

export const PARTNER_NAME = "Wick";
export const PARTNER_KIND: MonsterId = "candle";

// ---------- maps ----------

// Letters become scenery: S Snail King, M Merchant, O the Owl's tree, B the
// crypt box, G graves, g small graves, L lamps, T trees. A is where you
// start and E the way down. Anything else that isn't # is floor.
function buildMap(name: string, theme: number, rows: string[]): MapDef {
  const props: Prop[] = [];
  const spawn: { x: number; y: number }[] = [];
  let exit: { x: number; y: number } | undefined;
  const kinds: Record<string, { sprite: string; talk?: string; id?: string }> = {
    S: { sprite: "snail_king", talk: "snail", id: "snail" },
    M: { sprite: "merchant", talk: "merchant", id: "merchant" },
    O: { sprite: "owl_tree", talk: "owl", id: "owl" },
    B: { sprite: "mausoleum", talk: "box", id: "box" },
    G: { sprite: "grave_cross" },
    g: { sprite: "grave_small" },
    L: { sprite: "street_lamp" },
    T: { sprite: "tree_a" },
    U: { sprite: "tree_b" },
  };
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === "A") spawn.push({ x, y });
      else if (ch === "E") exit = { x, y };
      const k = kinds[ch];
      if (k) props.push({ id: k.id ?? `${k.sprite}-${x}-${y}`, x, y, sprite: k.sprite, talk: k.talk });
    });
  });
  const clean = rows.map((r) => r.replace(/[^#]/g, "."));
  return { name, theme, rows: clean, props, spawn, exit };
}

// The camp: a cavern under the cemetery where the stuck monsters live.
export const CAMP_MAP = buildMap("Camp", 5, [
  "##########################",
  "##########...E...#########",
  "#######...............####",
  "#####..g.....T.....g...###",
  "####.....................#",
  "###..S.............M.....#",
  "###......................#",
  "##..L................L...#",
  "##.......................#",
  "##..O.........B..........#",
  "##.......................#",
  "###..G...............G..##",
  "####....................##",
  "#####.......AA.......#####",
  "#######.....AA.....#######",
  "##########################",
]);

// The cemetery above, on the night of the fall.
export const CEMETERY_MAP = buildMap("The Cemetery", 4, [
  "############################",
  "#..T.....G....G....U.....T.#",
  "#.......................G..#",
  "#.G....L..........L........#",
  "#...........g.........g....#",
  "#A.........................#",
  "#A.....G.....G......G....T.#",
  "#..U.......L..........L....#",
  "#AA......g......G..........#",
  "############################",
]);

// ---------- scripts ----------

export const SCRIPTS = {
  // Up top: the walk, the glow, the hands, the fall.
  prologueCemetery: [
    { card: "Prologue", sub: "A Year Late" },
    { say: "narrator", text: "Your name is Alex Day. Last October, you won Scareathon." },
    { say: "narrator", text: "The prize was a shining trophy. It arrived this morning. A year late." },
    { walk: { alex: [11, 5], joe: [10, 4], matt: [9, 5], jon: [10, 6] } },
    { say: "joe", text: "So we're walking a trophy through a graveyard. At night. In October." },
    { say: "alex", text: "It's been in a box for a year. It deserves some fresh air." },
    { say: "matt", text: "It deserves a glass case and a spotlight. Honestly, so do I." },
    { say: "jon", text: "Did anyone else notice the box had no return address? Just a little skull stamp." },
    { say: "alex", text: "Jon. It's a Halloween trophy. Of course it has a skull stamp." },
    { walk: { alex: [15, 5], joe: [14, 4], matt: [13, 5], jon: [14, 6] } },
    { shake: 0.6 },
    { emote: "joe", icon: "!" },
    { emote: "matt", icon: "!" },
    { emote: "jon", icon: "!" },
    { say: "narrator", text: "The ground trembles." },
    { say: "jon", text: "That is not normal ground behaviour." },
    { say: "narrator", text: "In Alex's arms, the trophy begins to glow." },
    { prop: { id: "hand-1", x: 14, y: 5, sprite: "hand" } },
    { prop: { id: "hand-2", x: 16, y: 5, sprite: "hand" } },
    { prop: { id: "hand-3", x: 15, y: 4, sprite: "hand" } },
    { prop: { id: "hand-4", x: 15, y: 6, sprite: "hand" } },
    { say: "matt", text: "HANDS. WHY ARE THERE HANDS." },
    { say: "alex", text: "Guys—!" },
    { shake: 1 },
    { fade: "out" },
    { say: "narrator", text: "The earth opens, and swallows the champion whole." },
  ],

  // Down below: waking up, and Wick.
  prologueWake: [
    { fade: "in" },
    { say: "alex", text: "Ow. Okay. Everything hurts." },
    { say: "alex", text: "Joe? Matt? Jon?" },
    { emote: "wick", icon: "!" },
    { walk: { wick: "beside-alex" } },
    { say: "wick", text: "Oh! You're awake! I thought you were a very big, very dead mushroom." },
    { say: "alex", text: "...Thanks?" },
    { say: "wick", text: "I'm Wick! I live down here. Well, I hide down here. Mostly from everyone." },
    { say: "wick", text: "You fell from up there. With that." },
    { emote: "alex", icon: "?" },
    { say: "alex", text: "My trophy. It's still glowing." },
    { say: "wick", text: "Everything went funny the moment it landed. The monsters are all riled up." },
    { say: "wick", text: "Stick with me! There's a camp close by. Well, two floors down. Well, past some rats." },
    { say: "alex", text: "Great. Rats." },
  ],

  tutorialEnemy: [
    { say: "wick", text: "A rat! Walk into it to bonk it. Or tap one of your moves. You've got a CrossBow!" },
    { say: "wick", text: "Moves go the way you're facing, and they run out, so don't waste them." },
  ],
  tutorialStairs: [{ say: "wick", text: "Stairs! Step on them, then press the button to go down." }],
  tutorialFloor2: [{ say: "wick", text: "Nearly there. I can smell the campfire. It smells like old socks. That's how you know it's home." }],

  // Arriving at camp.
  campArrival: [
    { card: "The Camp" },
    { say: "wick", text: "We made it! Welcome to camp." },
    { walk: { alex: [6, 7], wick: [7, 7] } },
    { say: "snail", text: "Hmph. Another one falls out of the sky, and I'm supposed to be pleased." },
    { say: "wick", text: "This is the Snail King. He's in charge. He's... always like this." },
    { say: "snail", text: "I'm in charge because I'm the only one old enough to remember when things made sense." },
    { say: "snail", text: "Let me guess. You came down with something shiny." },
    { say: "alex", text: "My Scareathon trophy. I won it. Last year." },
    { say: "snail", text: "..." },
    { say: "snail", text: "Of course you did." },
    { say: "snail", text: "Since that thing arrived, the way up has been sealed. Nobody gets out. Not you. Not us." },
    { say: "alex", text: "My friends fell too. Joe, Matt and Jon. They could be anywhere down here." },
    { say: "snail", text: "Then you'll need help. The crypt goes deep, and most of what's in it is cranky." },
    { walk: { alex: [17, 6], wick: [16, 6] } },
    { say: "merchant", text: "Help? Help costs candy. Everything costs candy. Hello." },
    { say: "wick", text: "That's the Merchant. Don't ask what's under the hat." },
    { say: "merchant", text: "Hearts. Candy Corn. Elixirs. Bring candy, leave happy. Or just leave. Also fine." },
    { walk: { alex: [5, 10], wick: [6, 10] } },
    { say: "owl", text: "Hoo. Who hears everything? Me. The Owl." },
    { say: "owl", text: "And I hear the Rat King's been hoarding the camp's supplies down past the Graveyard Gate." },
    { say: "snail", text: "That rodent. Bring back our supplies and maybe this camp will trust you." },
    { say: "wick", text: "We can do it! We, um. Can probably do it." },
    { card: "Chapter 1", sub: "The Rat King" },
    { say: "narrator", text: "Talk to the Snail King to head into the crypt. The Merchant sells items, and the crypt box is where your team waits." },
  ],

  ch1Boss: [
    { say: "boss", text: "Well, well. A human. Smelling of shiny things." },
    { say: "boss", text: "Everything that falls down here is MINE. Supplies. Trinkets. Trophies." },
    { say: "alex", text: "The trophy's not yours. Neither is the camp's stuff." },
    { say: "wick", text: "Y-yeah! Give it back, you big... furry... rude... guy!" },
    { say: "boss", text: "Brave little candle. Let's see how you burn." },
  ],

  ch1After: [
    { card: "Chapter 1 Complete" },
    { say: "wick", text: "We did it! The Rat King's stash is back where it belongs." },
    { walk: { alex: [6, 7], wick: [7, 7] } },
    { say: "snail", text: "Hmph. Not bad. For a trophy-carrier." },
    { say: "snail", text: "The camp might even start trusting you. Don't let it go to your head." },
    { walk: { alex: [5, 10], wick: [6, 10] } },
    { say: "owl", text: "Hoo. Speaking of heads. There's a new one down in the Pumpkin Cellar." },
    { say: "owl", text: "Keeps yelling about his 'good side'. Won't stop posing for the pumpkins." },
    { say: "alex", text: "...That's Matt." },
    { say: "wick", text: "Your friend? We have to go get him!" },
    { card: "To Be Continued", sub: "Chapter 2: The Pumpkin Cellar is coming soon" },
  ],

  // Players who had a team before the story: skip up top, meet Wick at camp.
  veteranArrival: [
    { card: "The Camp" },
    { say: "wick", text: "Oh! You're the one who's been clearing out the crypt! I'm Wick." },
    { say: "wick", text: "I've been watching. From behind things. I'm very good at behind things." },
    { say: "wick", text: "Can I come with you? I'm small, but I'm on fire. A bit." },
    { say: "narrator", text: "Wick joined your team!" },
  ],
} satisfies Record<string, Step[]>;

export type ScriptId = keyof typeof SCRIPTS;

// What the camp's residents say when you walk up to them, by where you are in the story.
export function smallTalk(save: Save, who: string): string {
  const ch1 = hasFlag(save, "ch1");
  switch (who) {
    case "snail":
      return ch1 ? "The Pumpkin Cellar's next, I suppose. Try not to get squashed." : "The Rat King's past the Graveyard Gate. Off you go. Quietly.";
    case "merchant":
      return "Candy for goods. Goods for candy. It's a very simple relationship.";
    case "owl":
      return ch1 ? "Hoo. The Pumpkin Cellar's getting louder. Someone down there loves an audience." : "Hoo. Throw Candy Corn at a monster before you beat it, and it might just follow you home.";
    case "box":
      return "Your crypt box. The monsters who've joined you wait here.";
    default:
      return "";
  }
}

// The chapter to play next, if it's been written.
export interface Chapter {
  flag: string;
  stage: number;
  title: string;
  boss: ScriptId;
  after: ScriptId;
}

export const CHAPTERS: Chapter[] = [{ flag: "ch1", stage: 0, title: "The Rat King", boss: "ch1Boss", after: "ch1After" }];

export function nextChapter(save: Save): Chapter | null {
  if (!hasFlag(save, "prologue")) return null;
  return CHAPTERS.find((c) => !hasFlag(save, c.flag)) ?? null;
}

// Players who'd already played before the story (a team, levels or stages).
export function isVeteran(save: Save) {
  return save.cleared > 0 || save.monsters.length > 0 || Object.values(save.heroes).some((h) => h.level > 1);
}
