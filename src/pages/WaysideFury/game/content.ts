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
