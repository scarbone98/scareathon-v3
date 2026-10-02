import { CATEGORY_LABELS } from "./look";

// The item shop's filters. Kept apart from the (lazily loaded) shop itself, so whoever
// lays the shop out can put them where they like.

export type ShopFilters = { search: string; classification: string; rarity: string };

export const NO_FILTERS: ShopFilters = { search: "", classification: "", rarity: "" };

const classifications = [
  { value: "", label: "All categories" },
  ...Object.entries(CATEGORY_LABELS)
    .filter(([value]) => value !== "background") // (they come with banners)
    .map(([value, label]) => ({ value, label })),
];

const rarities = [
  { value: "", label: "All rarities" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" },
];

// The category and rarity menus. extraCategories: wares that aren't avatar items (the
// station's banners), as [value, plural label]
export function ShopFilterMenus({
  filters,
  onChange,
  extraCategories = [],
  className = "",
}: {
  filters: ShopFilters;
  onChange: (next: ShopFilters) => void;
  extraCategories?: [string, string][];
  className?: string;
}) {
  const select =
    "h-8 min-w-0 flex-1 rounded-md border border-[#494054] bg-[#191620] px-2 text-xs text-[#eee5f8] focus:border-[#bda0de] focus:outline-none";
  return (
    <div className={`flex gap-2 ${className}`}>
      <select className={select} aria-label="Category" value={filters.classification} onChange={(event) => onChange({ ...filters, classification: event.target.value })}>
        {classifications.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
        {extraCategories.map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select className={select} aria-label="Rarity" value={filters.rarity} onChange={(event) => onChange({ ...filters, rarity: event.target.value })}>
        {rarities.map((option) => (
          <option key={option.value || "all"} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
