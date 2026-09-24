// Starter decks until the deck builder lands.
export interface PresetDeck {
  id: string;
  name: string;
  blurb: string;
  cards: string[];
}

export const PRESET_DECKS: PresetDeck[] = [
  {
    id: "swamp",
    name: "Swamp Stomp",
    blurb: "Walk the Swamp Thing in and pile support behind it.",
    cards: ["swampthing", "scarecrow", "crow", "imp", "zombie", "candle", "meteor", "comet"],
  },
  {
    id: "night",
    name: "Night Flight",
    blurb: "Rule the sky with a UFO, ghosts and skulls.",
    cards: ["ufo", "ghost", "skull", "crow", "rat", "werewolf", "meteor", "comet"],
  },
  {
    id: "brawl",
    name: "Graveyard Brawl",
    blurb: "Cheap, fast pressure with a Shadow Beast to clean up.",
    cards: ["shadowbeast", "werewolf", "pumpkin", "rat", "imp", "zombie", "candle", "comet"],
  },
];

export type Difficulty = "easy" | "normal" | "hard";

// Bot reaction time range in ticks (20 per second).
export const BOT_REACTION: Record<Difficulty, [number, number]> = {
  easy: [24, 44],
  normal: [10, 22],
  hard: [4, 10],
};
