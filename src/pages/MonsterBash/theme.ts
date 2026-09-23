// Each corner keeps one color everywhere: arena HUD, odds chart, bet slip.
// The pair is validated for colorblind separation on the dark page surface.
export const SIDE_COLORS = ["#d95926", "#3987e5"] as const;
export const SIDE_COLOR_NUMBERS = [0xd95926, 0x3987e5] as const;
export const SIDE_LABELS = ["Left corner", "Right corner"] as const;

export function formatPercent(p: number) {
  return `${Math.round(p * 100)}%`;
}
