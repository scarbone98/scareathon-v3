import { useEffect, useRef, type TouchEvent } from "react";
import { CATEGORY_LABELS } from "./look";

// The item shop's filters. Kept apart from the (lazily loaded) shop itself, so whoever
// lays the shop out can put them where they like.

export type ShopFilters = { search: string; classification: string; rarity: string };

export const NO_FILTERS: ShopFilters = { search: "", classification: "", rarity: "" };

// Some kinds of thing are filtered together: one tab for several
// categories (its value is their names, comma-separated, as the shop's API takes them)
const COMBINED: { label: string; categories: string[] }[] = [
  { label: "Face", categories: ["face_paint", "face_acc"] }, // face paint, masks, glasses
  { label: "Back", categories: ["back", "wings"] },
];

const classifications = [
  { value: "", label: "All" },
  ...Object.entries(CATEGORY_LABELS)
    .filter(([value]) => value !== "background") // (they come with banners)
    .flatMap(([value, label]) => {
      const combined = COMBINED.find((group) => group.categories.includes(value));
      if (!combined) return [{ value, label }];
      // (once, where the first of its categories would have been)
      return combined.categories[0] === value ? [{ value: combined.categories.join(","), label: combined.label }] : [];
    }),
];

const rarities = [
  { value: "", label: "All rarities" },
  { value: "common", label: "Common" },
  { value: "uncommon", label: "Uncommon" },
  { value: "rare", label: "Rare" },
  { value: "epic", label: "Epic" },
  { value: "legendary", label: "Legendary" },
];

// The categories as tabs, in the order they run. extraCategories: wares that aren't avatar
// items (the station's banners), as [value, plural label]
export function shopTabs(extraCategories: [string, string][] = []) {
  return [...classifications, ...extraCategories.map(([value, label]) => ({ value, label }))];
}

// The category tabs: a strip that scrolls sideways under a finger, the one you're on lit
// (and kept in view)
export function ShopCategoryTabs({
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
  const tabs = shopTabs(extraCategories);
  const current = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [filters.classification]);
  return (
    <div role="tablist" aria-label="Category" className={`flex gap-1.5 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
      {tabs.map((tab) => {
        const on = tab.value === filters.classification;
        return (
          <button
            key={tab.value || "all"}
            ref={on ? current : undefined}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange({ ...filters, classification: tab.value })}
            className={`h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition ${
              on ? "border-[#f2c35b] bg-[#f2c35b] text-[#1a1420]" : "border-[#494054] bg-[#191620] text-[#eee5f8] hover:border-[#bda0de]"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// Swiping sideways across the wares turns to the next tab, or the one before: the touch
// handlers for whatever holds them (an up-and-down drag is left to scroll)
export function useTabSwipe(filters: ShopFilters, onChange: (next: ShopFilters) => void, extraCategories: [string, string][] = []) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (event: TouchEvent) => {
      const touch = event.touches[0];
      start.current = event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd: (event: TouchEvent) => {
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x;
      const dy = touch.clientY - from.y;
      if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 2) return;
      const tabs = shopTabs(extraCategories);
      const index = tabs.findIndex((tab) => tab.value === filters.classification);
      const next = tabs[index + (dx < 0 ? 1 : -1)];
      if (next) onChange({ ...filters, classification: next.value });
    },
  };
}

// The rarity menu
export function ShopFilterMenus({
  filters,
  onChange,
  className = "",
}: {
  filters: ShopFilters;
  onChange: (next: ShopFilters) => void;
  className?: string;
}) {
  const select =
    "h-8 min-w-0 flex-1 rounded-md border border-[#494054] bg-[#191620] px-2 text-xs text-[#eee5f8] focus:border-[#bda0de] focus:outline-none";
  return (
    <div className={`flex gap-2 ${className}`}>
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
