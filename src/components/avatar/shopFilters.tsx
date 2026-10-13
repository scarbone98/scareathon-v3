import { useEffect, useRef, type TouchEvent } from "react";
import { CATEGORY_LABELS } from "./look";
import "../../styles/shop.css";

// The item shop's filters. Kept apart from the (lazily loaded) shop itself, so whoever
// lays the shop out can put them where they like.

export type ShopFilters = { search: string; classification: string; rarity: string };

// Shared shop defaults; editing this module refreshes its non-component consumers too.
// eslint-disable-next-line react-refresh/only-export-components
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

// Kinds of ware the shop has a tab for but nothing on the shelf yet (what the empty shelf
// says: `soon`). None just now: what was to be "in-game items" are the supplies for the
// cellar's cryptlin and the aquarium, each with a tab of its own (things/PetItems.tsx).
// Shared with AvatarShop so its empty-state copy matches these tabs.
// eslint-disable-next-line react-refresh/only-export-components
export const EMPTY_SHELVES: { value: string; label: string; soon: string }[] = [];

// The categories as tabs, in the order they run. extraCategories: wares that aren't avatar
// items (the station's banners), as [value, plural label]
// Tabs and the swipe hook share the same order; callers import this module together.
// eslint-disable-next-line react-refresh/only-export-components
export function shopTabs(extraCategories: [string, string][] = []) {
  return [...classifications, ...extraCategories.map(([value, label]) => ({ value, label })), ...EMPTY_SHELVES];
}

// Two shelves wear a picture in place of their name: a fish for the aquarium's supplies and
// a little monster for the cryptlin's, drawn in big pixels like the station's signs (one
// character a pixel; they take the tab's own colour)
const TAB_PICTURES: Record<string, string[]> = {
  aquarium: [
    "...........x..",
    "x....xxxxx.xx.",
    "xx.xxxxxxxxxx.",
    "xxxxxxxxx.xxxx",
    "xxxxxxxxxxxxxx",
    "xx.xxxxxxxxxx.",
    "x....xxxxx.x..",
    ".......xx.....",
  ],
  cryptlins: [
    "x...........x",
    "xx.........xx",
    "xxx.xxxxx.xxx",
    ".xxxxxxxxxxx.",
    "..xx.xxx.xx..",
    "..xx.xxx.xx..",
    "..xxxxxxxxx..",
    "..xx.x.x.xx..",
    "...xxxxxxx...",
  ],
};

function TabPicture({ rows }: { rows: string[] }) {
  return (
    <svg viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" className="h-[18px] w-auto" fill="currentColor" aria-hidden>
      {rows.map((row, y) => [...row].map((cell, x) => (cell === "x" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} /> : null)))}
    </svg>
  );
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
    <div role="tablist" aria-label="Category" className={`flex gap-2 overflow-x-auto overscroll-x-contain pb-1.5 pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}>
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
            className={`shop-tab ${on ? "is-on" : ""}`}
            aria-label={TAB_PICTURES[tab.value] ? tab.label : undefined}
            title={TAB_PICTURES[tab.value] ? tab.label : undefined}
          >
            {TAB_PICTURES[tab.value] ? <TabPicture rows={TAB_PICTURES[tab.value]} /> : tab.label}
          </button>
        );
      })}
    </div>
  );
}

// Swiping sideways across the wares turns to the next tab, or the one before: the touch
// handlers for whatever holds them (an up-and-down drag is left to scroll)
// Keep the filter controls and their gesture hook in the same public module.
// eslint-disable-next-line react-refresh/only-export-components
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
  const select = "shop-select";
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
