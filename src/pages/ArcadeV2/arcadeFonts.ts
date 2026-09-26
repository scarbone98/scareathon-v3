// Each game's name is set in a Google Font that suits it (games.tsx,
// cartridge.font). They're only fetched when the arcade opens.

export type ArcadeFont = { family: string; weight?: number };

const FALLBACK = "Zombie, Creepster, cursive";
// Settles once the stylesheet (and so the @font-face rules) has arrived
let stylesheet: Promise<void> | null = null;

export function linkArcadeFonts(fonts: ArcadeFont[]) {
  if (stylesheet || typeof document === "undefined") return;
  const families = [...new Map(fonts.map((font) => [`${font.family}:${font.weight ?? 400}`, font])).values()]
    .map((font) => `family=${font.family.replace(/ /g, "+")}${font.weight ? `:wght@${font.weight}` : ""}`)
    .join("&");
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?${families}&display=swap`;
  stylesheet = new Promise((resolve) => {
    link.onload = link.onerror = () => resolve();
  });
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
