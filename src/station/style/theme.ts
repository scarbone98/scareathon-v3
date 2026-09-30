// The station's look, borrowed from old railway signage: navy enamel with cream
// lettering and a cream rule, cream ticket stubs, and amber lamplight for emphasis.

export const serif = { fontFamily: "Georgia, 'Times New Roman', serif" };
export const sans = { fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" };

// A small enamel plate: navy, a cream inner rule, and a dark outer edge
export const plate =
  "bg-[#1d2a3a] text-[#f2ead2] ring-1 ring-inset ring-[#f2ead2]/70 outline outline-2 outline-[#0b1017] shadow-[0_6px_18px_rgba(0,0,0,0.55)]";

// A ticket stub: cream card, dark ink, a perforated left edge
export const stub =
  "relative bg-[#efe3c8] text-[#1d2a3a] shadow-[2px_3px_0_rgba(0,0,0,0.5)] before:absolute before:inset-y-1 before:left-1 before:border-l-2 before:border-dotted before:border-[#1d2a3a]/40";

// Primary action: a stub you can press
export const stubButton = `${stub} inline-flex items-center gap-2 rounded-[3px] py-2 pl-5 pr-4 text-sm font-semibold uppercase tracking-[0.12em] transition hover:-translate-y-px hover:bg-[#fff4d8] active:translate-y-0 disabled:opacity-60`;

// Secondary action: cream rule on navy
export const plateButton =
  "inline-flex items-center gap-2 rounded-[3px] px-3 py-1.5 text-sm text-[#f2ead2] ring-1 ring-[#f2ead2]/40 transition hover:bg-[#f2ead2]/10";
