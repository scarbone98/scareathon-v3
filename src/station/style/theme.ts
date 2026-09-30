// The station's look, borrowed from old railway signage: navy enamel with cream
// lettering and a cream rule, cream ticket stubs, and amber lamplight for emphasis.
// Nothing too crisp: the scene is drawn in big pixels, so the controls are pixel-cut
// with hard shadows, and printed matter uses period faces on grainy paper.

// The typefaces (loaded by STATION_FONTS): an old printer's face for headings, a worn
// typewriter for notices, and a pixel face for the station's own controls
export const serif = { fontFamily: "'IM Fell English', Georgia, 'Times New Roman', serif" };
export const typewriter = { fontFamily: "'Special Elite', 'Courier New', monospace" };
export const pixel = { fontFamily: "'Pixelify Sans', ui-monospace, monospace" };
export const sans = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };
export const STATION_FONTS =
  "https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Pixelify+Sans:wght@400;600&family=Special+Elite&display=swap";

// Paper grain, laid over a paper's own colour
export const PAPER_GRAIN =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.25  0 0 0 0 0.17  0 0 0 0 0.08  0 0 0 0.45 0'/></filter><rect width='160' height='160' filter='url(%23n)'/></svg>\")";
export const paperStyle = (tint: string) => ({ backgroundColor: tint, backgroundImage: PAPER_GRAIN, ...typewriter });

// A small enamel plate: navy, a hard cream rule, a hard shadow
export const plate = "bg-[#1d2a3a] text-[#f2ead2] border-2 border-[#f2ead2]/85 shadow-[3px_3px_0_#05070c] font-['Pixelify_Sans']";

// A ticket stub: cream card, dark ink, a perforated left edge
export const stub =
  "relative bg-[#efe3c8] text-[#1d2a3a] shadow-[3px_3px_0_rgba(0,0,0,0.6)] before:absolute before:inset-y-1 before:left-1 before:border-l-2 before:border-dotted before:border-[#1d2a3a]/40";

// Primary action: a stub you can press
export const stubButton = `${stub} inline-flex items-center gap-2 py-2 pl-5 pr-4 font-['Pixelify_Sans'] text-[15px] uppercase tracking-[0.08em] transition hover:-translate-y-px hover:bg-[#fff4d8] active:translate-y-0 disabled:opacity-60`;

// Secondary action: cream rule on navy
export const plateButton =
  "inline-flex items-center gap-2 px-3 py-1.5 font-['Pixelify_Sans'] text-[15px] text-[#f2ead2] border-2 border-[#f2ead2]/40 transition hover:bg-[#f2ead2]/10";
