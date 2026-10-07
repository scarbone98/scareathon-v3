// Shared world geometry keeps render markers and interaction checks in sync.
export const LOCATIONS = [
  { id: "wayside", name: "Wayside", x: 66, y: 116, locked: false },
  { id: "blast", name: "The Blast Site", x: 252, y: 80, locked: false },
  { id: "forest", name: "Hollow Woods", x: 145, y: 64, locked: true },
  { id: "city", name: "Old City", x: 250, y: 145, locked: true },
] as const;
export const HUB_POINTS = [
  { id: "shop", name: "Shop", x: 92, y: 89 },
  { id: "home", name: "Home", x: 219, y: 88 },
  { id: "taxi", name: "Taxi", x: 160, y: 151 },
] as const;
export const SHOP_ITEMS = [
  { id: "heal", name: "Candy tonic", description: "Restore 55 HP to the active hero.", cost: 8 },
  { id: "power", name: "Power charm", description: "Both heroes gain +2 Power.", cost: 20 },
  { id: "defense", name: "Ward charm", description: "Both heroes gain +1 Defense.", cost: 20 },
] as const;
export type ShopItemId = typeof SHOP_ITEMS[number]["id"];

export interface StoryBeat {
  phase: "backstory" | "years" | "bbq" | "dark" | "portal" | "suitup" | "taxi";
  speaker: string; hero: "joe" | "matt" | "alex" | "jon" | null; frame: number; text: string;
}
export const PROLOGUE: StoryBeat[] = [
  { phase: "backstory", speaker: "Previously", hero: null, frame: 0, text: "The crew escaped the 8 Bit Evil realm. The hordes fell. For once, the celebration lasted longer than the danger." },
  { phase: "years", speaker: "Five years later", hero: null, frame: 0, text: "Life is good. Wayside is quiet. Tonight's biggest threat is Joe's cooking." },
  { phase: "bbq", speaker: "Joe", hero: "joe", frame: 1, text: "Five years without a horde. I think we've finally earned a normal backyard BBQ." },
  { phase: "bbq", speaker: "Matt", hero: "matt", frame: 1, text: "Then stop charging the grill with ki. Those burgers have a power level." },
  { phase: "bbq", speaker: "Alex", hero: "alex", frame: 1, text: "If dinner transforms, Jon's on dishes." },
  { phase: "dark", speaker: "Jon", hero: "jon", frame: 2, text: "Guys? That isn't a cloud. The whole sky just went dark." },
  { phase: "dark", speaker: "Joe", hero: "joe", frame: 2, text: "An explosion... out past the old road. Something hit the ground." },
  { phase: "portal", speaker: "The Architect", hero: null, frame: 0, text: "The hordes were only the beginning. Five years of silence... now my Creation can wake." },
  { phase: "portal", speaker: "Matt", hero: "matt", frame: 2, text: "A portal. And that thing he's carrying... is it an egg? It's alive." },
  { phase: "suitup", speaker: "Joe", hero: "joe", frame: 4, text: "Gloves on. Gear up. Whatever crawled out of there, we find it before it reaches Wayside." },
  { phase: "taxi", speaker: "Alex", hero: "alex", frame: 0, text: "Everybody in the taxi. Jon and I will secure Wayside. Joe, Matt: take point at the blast site." },
  { phase: "taxi", speaker: "Chapter 1 · The Blast Site", hero: null, frame: 0, text: "The real evil has arrived. Drive to Wayside for supplies, or head east to the impact site." },
];
