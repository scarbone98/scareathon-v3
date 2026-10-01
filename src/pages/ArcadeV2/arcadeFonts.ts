// Each game's name is set in a Google Font that suits it (games.tsx,
// cartridge.font). They're only fetched when the arcade opens.

export type ArcadeFont = { family: string; weight?: number };

// The info card's green-screen lettering
export const TERMINAL_FONT: ArcadeFont = { family: "VT323" };

const FALLBACK = "Zombie, Creepster, cursive";
// Settles once every stylesheet asked for so far (and so the @font-face rules) has arrived
let stylesheet: Promise<void> = Promise.resolve();
// The fonts already asked for: a later call (the arcade, after the station's cabinet)
// adds only what's new, rather than being ignored
const requested = new Set<string>();

export function linkArcadeFonts(fonts: ArcadeFont[]) {
  if (typeof document === "undefined") return;
  const wanted = [...new Map(fonts.map((font) => [`${font.family}:${font.weight ?? 400}`, font])).entries()].filter(([key]) => !requested.has(key));
  if (wanted.length === 0) return;
  wanted.forEach(([key]) => requested.add(key));
  const families = wanted
    .map(([, font]) => `family=${font.family.replace(/ /g, "+")}${font.weight ? `:wght@${font.weight}` : ""}`)
    .join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  const loaded = new Promise<void>((resolve) => {
    link.onload = link.onerror = () => resolve();
  });
  stylesheet = Promise.all([stylesheet, loaded]).then(() => undefined);
  document.head.appendChild(link);
}

export function fontFamily(font: ArcadeFont) {
  return `"${font.family}", ${FALLBACK}`;
}

// Weight and family without a size, for drawNeonMarquee
export function marqueeFont(font: ArcadeFont) {
  return `${font.weight ?? 400} ${fontFamily(font)}`;
}

// A canvas font string, e.g. for context.font
export function canvasFont(font: ArcadeFont, sizePx: number) {
  return `${font.weight ?? 400} ${sizePx}px ${fontFamily(font)}`;
}

// Resolves once the font can be drawn (or failed to load)
export async function whenFontReady(font: ArcadeFont) {
  await stylesheet;
  await document.fonts?.load(canvasFont(font, 64)).catch(() => []);
}
