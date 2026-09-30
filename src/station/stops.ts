// The station's layout. The visitor stands on the platform (the hub) and turns between
// headings, Inscryption-style; each object is a close-up stop they walk up to.

export type StopId = "bulletin" | "events" | "arcade" | "departures" | "tickets";
export type Heading = "front" | "table" | "right" | "back" | "left";

export type Stop = {
  id: StopId;
  label: string;
  blurb: string;
  href: string;
  cta: string;
  heading: Heading; // the way the visitor faces when they step back from it
  pos: [number, number, number]; // camera position for the close-up
  target: [number, number, number]; // what the camera looks at
  fit?: number; // metres that must fit across the screen, stepping back on narrow ones
  fitHeight?: number; // metres that must fit top to bottom, above a phone's held card
};

// Clockwise, so "turn right" is the next entry. Wide screens see the board and the events
// table in one view; phones turn to each on its own.
export const HEADINGS: Heading[] = ["front", "right", "back", "left"];
export const PHONE_HEADINGS: Heading[] = ["front", "table", "right", "back", "left"];

// Where the visitor stands, and how they look along each heading. The camera looks
// down -z at yaw 0; the building's wall is at z = -2.2 and the tracks run along +z.
export const HUB = {
  pos: [0, 1.6, 2.2] as [number, number, number],
  yaw: { front: 0, table: -0.6, right: -Math.PI / 2, back: Math.PI, left: Math.PI / 2 } as Record<Heading, number>,
  pitch: { front: 0.05, table: 0.02, right: 0.12, back: -0.06, left: -0.05 } as Record<Heading, number>,
};

// `aim` is where a wide screen looks (to take in the whole wall); tall screens look
// straight at the view's object
export const VIEWS: Record<Heading, { title: string; blurb: string; focus: StopId | null; aim?: [number, number, number] }> = {
  front: { title: "Wayside Station", blurb: "The station board: news, what's on, and your ticket.", focus: "bulletin", aim: [0.3, 1.8, -2.2] },
  table: { title: "Events table", blurb: "Scareathon, tonight's film, and the rules.", focus: "events" },
  right: { title: "Ticket kiosk", blurb: "The shop, and the departure board above it.", focus: "tickets" },
  back: { title: "The tracks", blurb: "The last train left a long time ago. Mostly.", focus: null },
  left: { title: "Arcade cabinet", blurb: "Someone left it plugged in.", focus: "arcade" },
};

export const STOPS: Record<StopId, Stop> = {
  bulletin: {
    id: "bulletin",
    label: "Station board",
    blurb: "News, what's on, and your ticket.",
    href: "/",
    cta: "Home",
    heading: "front",
    pos: [-0.9, 1.9, 0.35],
    target: [-0.9, 2.0, -2.1],
    fit: 2.4, // the tall board, two papers wide
    fitHeight: 3.7,
  },
  events: {
    id: "events",
    label: "Events table",
    blurb: "Flyers for the events at the station.",
    href: "/scareathon",
    cta: "See Scareathon",
    heading: "table",
    pos: [1.9, 1.75, 0.2],
    target: [1.9, 1.5, -1.6],
    fit: 1.8,
    fitHeight: 2.0,
  },
  arcade: {
    id: "arcade",
    label: "Arcade cabinet",
    blurb: "Pick a cartridge, play, climb the leaderboards.",
    href: "/arcade",
    cta: "Play the arcade",
    heading: "left",
    pos: [-3.6, 1.55, 0.35],
    target: [-3.6, 1.3, -1.75],
  },
  departures: {
    id: "departures",
    label: "Departure board",
    blurb: "Standings, the calendar and what leaves next.",
    href: "/scareathon/scareboard",
    cta: "View the Scareboard",
    heading: "right",
    pos: [1.6, 2.75, -0.1],
    target: [3.4, 3.3, -0.1],
    fit: 2.8,
    fitHeight: 1.4,
  },
  tickets: {
    id: "tickets",
    label: "Ticket kiosk",
    blurb: "Spend your coins on avatar pieces and more.",
    href: "/profile/shop",
    cta: "Visit the shop",
    heading: "right",
    pos: [3.2, 1.6, -0.1],
    target: [4.8, 1.65, -0.1],
    fit: 1.35,
    fitHeight: 1.5,
  },
};

export const STOP_IDS = Object.keys(STOPS) as StopId[];

export const isStopId = (value: string | null): value is StopId =>
  value !== null && Object.prototype.hasOwnProperty.call(STOPS, value);

export const isHeading = (value: string | null): value is Heading =>
  value !== null && (PHONE_HEADINGS as string[]).includes(value);

// Walks to an object, optionally opening something there (a tab, or a game in the arcade)
export type GoTo = (id: StopId, open?: string) => void;

// The kiosk's catalogue: what ?open= can name at the ticket kiosk
export type CatalogueTab = "shop" | "wardrobe" | "inbox" | "account";
export const isCatalogueTab = (value?: string | null): value is CatalogueTab =>
  value === "shop" || value === "wardrobe" || value === "inbox" || value === "account";
