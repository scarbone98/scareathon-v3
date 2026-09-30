// The station's layout. The visitor stands on the platform (the hub), facing the station
// board, and turns between headings, Inscryption-style; each object is a close-up stop
// they walk up to. Left to right: the end of the platform (a railing, a bench, the view),
// the arcade cabinet, the station board, the flyer stand, the pigeonhole wall; then a side
// wall runs out towards the tracks, with the ticket counter let into it (the departure
// board above) and the left-luggage lockers beside it.

export type StopId = "lockers" | "arcade" | "bulletin" | "events" | "tickets" | "departures" | "mail";
export type Heading = "front" | "table" | "mail" | "right" | "lockers" | "back" | "lookout" | "left";

export type Stop = {
  id: StopId;
  label: string;
  heading: Heading; // the way the visitor faces when they step back from it
  pos: [number, number, number]; // camera position for the close-up
  target: [number, number, number]; // what the camera looks at
  fit?: number; // metres that must fit across the screen, stepping back on narrow ones
  fitHeight?: number; // metres that must fit top to bottom, above a phone's held card
  snug?: boolean; // stand exactly where it fits (closer too), not just far enough back
};

// Clockwise, so "turn right" is the next entry. Wide screens take in the wall in three
// views (left, front, right); phones turn to each object on its own.
export const HEADINGS: Heading[] = ["front", "right", "back", "lookout", "left"];
export const PHONE_HEADINGS: Heading[] = ["front", "table", "mail", "right", "lockers", "back", "lookout", "left"];

// Where the visitor stands, and how they look along each heading. The camera looks
// down -z at yaw 0; the building's wall is at z = -2.2 and the tracks run along +z.
// A view with an object faces it (or its `aim`, on wide screens); these are the rest.
export const HUB = {
  pos: [-0.9, 1.6, 0.95] as [number, number, number],
  yaw: { front: 0, table: -0.6, mail: -0.9, right: -1.1, lockers: -1.3, back: Math.PI, lookout: 1.75, left: 0.8 } as Record<Heading, number>,
  pitch: { front: 0.05, table: 0.02, mail: 0.02, right: 0.08, lockers: 0.02, back: -0.06, lookout: 0.02, left: 0.02 } as Record<Heading, number>,
};

// `aim` is where a wide screen looks (to take in a stretch of wall); tall screens look
// straight at the view's object
export const VIEWS: Record<Heading, { title: string; focus: StopId | null; aim?: [number, number, number] }> = {
  front: { title: "Wayside Station", focus: "bulletin", aim: [-0.9, 1.75, -2.2] },
  table: { title: "Flyer stand", focus: "events" },
  mail: { title: "Pigeonholes", focus: "mail" },
  right: { title: "Ticket counter", focus: "tickets", aim: [4.6, 1.8, -0.8] },
  lockers: { title: "Left luggage", focus: "lockers" },
  back: { title: "The tracks", focus: null },
  lookout: { title: "The end of the platform", focus: null },
  left: { title: "Arcade cabinet", focus: "arcade", aim: [-3.3, 1.4, -1.75] },
};

export const STOPS: Record<StopId, Stop> = {
  lockers: {
    id: "lockers",
    label: "Left luggage",
    heading: "lockers",
    pos: [3.0, 1.55, 0.95],
    target: [5.1, 1.3, 0.95],
    fit: 2.0,
    fitHeight: 2.4,
  },
  arcade: {
    id: "arcade",
    label: "Arcade cabinet",
    heading: "left",
    pos: [-3.3, 1.55, 0.35],
    target: [-3.3, 1.3, -1.75],
  },
  bulletin: {
    id: "bulletin",
    label: "Station board",
    heading: "front",
    pos: [-0.9, 1.9, 0.35],
    target: [-0.9, 1.85, -2.1],
    // The tall board and its sign: just their width across a phone, so they fill most of it
    fit: 2.18,
    fitHeight: 3.2,
    snug: true,
  },
  events: {
    id: "events",
    label: "Flyer stand",
    heading: "table",
    pos: [1.45, 1.75, 0.3],
    target: [1.45, 1.75, -1.9],
    fit: 1.05,
    fitHeight: 3.25,
    snug: true,
  },
  tickets: {
    id: "tickets",
    label: "Ticket counter",
    heading: "right",
    pos: [3.1, 1.6, -1.0],
    target: [5.25, 1.6, -1.0],
    fit: 1.9,
    fitHeight: 1.9,
  },
  departures: {
    id: "departures",
    label: "Departure board",
    heading: "right",
    pos: [2.6, 2.9, -0.85],
    target: [5.2, 3.35, -0.85],
    fit: 2.8,
    fitHeight: 1.4,
  },
  mail: {
    id: "mail",
    label: "Pigeonholes",
    heading: "mail",
    pos: [3.55, 1.5, 0.4],
    target: [3.55, 1.35, -2.0],
    fit: 3.4, // the pigeonholes and the register beside them
    fitHeight: 2.3,
  },
};

export const STOP_IDS = Object.keys(STOPS) as StopId[];

export const isStopId = (value: string | null): value is StopId =>
  value !== null && Object.prototype.hasOwnProperty.call(STOPS, value);

export const isHeading = (value: string | null): value is Heading =>
  value !== null && (PHONE_HEADINGS as string[]).includes(value);

// Walks to an object, optionally opening something there (a tab, or a game in the arcade)
export type GoTo = (id: StopId, open?: string) => void;
