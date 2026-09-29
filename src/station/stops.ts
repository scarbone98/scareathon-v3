// The station's layout. The visitor stands on the platform (the hub) and turns between
// four headings, Inscryption-style; each object is a close-up stop they walk up to.
// Each object opens an existing page of the current site.

export type StopId = "bulletin" | "events" | "arcade" | "departures" | "tickets";
export type Heading = "front" | "right" | "back" | "left";

export type Stop = {
  id: StopId;
  label: string;
  blurb: string;
  href: string;
  cta: string;
  heading: Heading; // the way the visitor faces when they step back from it
  pos: [number, number, number]; // camera position for the close-up
  target: [number, number, number]; // what the camera looks at
};

// Clockwise, so "turn right" is the next entry
export const HEADINGS: Heading[] = ["front", "right", "back", "left"];

// Where the visitor stands, and how they look along each heading. The camera looks
// down -z at yaw 0; the building's wall is at z = -2.2 and the tracks run along +z.
export const HUB = {
  pos: [0, 1.6, 0.6] as [number, number, number],
  yaw: { front: 0, right: -Math.PI / 2, back: Math.PI, left: Math.PI / 2 } as Record<Heading, number>,
  pitch: { front: -0.13, right: 0.06, back: -0.06, left: -0.05 } as Record<Heading, number>,
};

export const VIEWS: Record<Heading, { title: string; blurb: string; focus: StopId | null }> = {
  front: { title: "Notice board", blurb: "News, flyers and what's on.", focus: "bulletin" },
  right: { title: "Ticket kiosk", blurb: "The shop, and the departure board above it.", focus: "tickets" },
  back: { title: "The tracks", blurb: "The last train left a long time ago. Mostly.", focus: null },
  left: { title: "Arcade cabinet", blurb: "Someone left it plugged in.", focus: "arcade" },
};

export const STOPS: Record<StopId, Stop> = {
  bulletin: {
    id: "bulletin",
    label: "Notice board",
    blurb: "News, announcements and what's on.",
    href: "/announcements",
    cta: "Read the news",
    heading: "front",
    pos: [-0.4, 1.72, -0.55],
    target: [-0.4, 1.72, -2.1],
  },
  events: {
    id: "events",
    label: "Events table",
    blurb: "Flyers for the events at the station.",
    href: "/scareathon",
    cta: "See Scareathon",
    heading: "front",
    pos: [0.9, 1.8, -0.1],
    target: [0.9, 0.85, -1.25],
  },
  arcade: {
    id: "arcade",
    label: "Arcade cabinet",
    blurb: "Pick a cartridge, play, climb the leaderboards.",
    href: "/arcade",
    cta: "Play the arcade",
    heading: "left",
    pos: [-2.5, 1.55, 0],
    target: [-4.2, 1.3, 0],
  },
  departures: {
    id: "departures",
    label: "Departure board",
    blurb: "Standings, the calendar and what leaves next.",
    href: "/scareathon/scareboard",
    cta: "View the Scareboard",
    heading: "right",
    pos: [1.7, 2.3, -0.1],
    target: [3.4, 2.95, -0.1],
  },
  tickets: {
    id: "tickets",
    label: "Ticket kiosk",
    blurb: "Spend your coins on avatar pieces and more.",
    href: "/profile/shop",
    cta: "Visit the shop",
    heading: "right",
    pos: [2.3, 1.65, -0.1],
    target: [4.8, 1.45, -0.1],
  },
};

export const STOP_IDS = Object.keys(STOPS) as StopId[];

export const isStopId = (value: string | null): value is StopId =>
  value !== null && Object.prototype.hasOwnProperty.call(STOPS, value);

export const isHeading = (value: string | null): value is Heading =>
  value !== null && (HEADINGS as string[]).includes(value);
