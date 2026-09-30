// The station's layout. The visitor stands on the platform (the hub), facing the station
// board, and turns between headings, Inscryption-style; each object is a close-up stop
// they walk up to. Left to right: the end of the platform (a railing and a bench: the
// scenic view), the left-luggage lockers, the arcade cabinet, the station board, the flyer
// stand, the pigeonhole wall; then a side wall runs out towards the tracks, with the
// ticket counter let into its middle and the scoreboard above.

export type StopId = "bench" | "lockers" | "arcade" | "bulletin" | "events" | "tickets" | "departures" | "mail";
// The four views you turn between (left, the board, right, and the tracks behind you);
// the others are just where a stop steps back to, folded into one of the four
export type Heading = "front" | "right" | "back" | "left" | "table" | "mail" | "lockers";

export type Stop = {
  id: StopId;
  label: string;
  heading: Heading; // the way the visitor faces when they step back from it
  pos: [number, number, number]; // camera position for the close-up
  target: [number, number, number]; // what the camera looks at
  fit?: number; // metres that must fit across the screen, stepping back on narrow ones
  fitHeight?: number; // metres that must fit top to bottom, above a phone's held card
  snug?: boolean; // stand exactly where it fits (closer too), not just far enough back
  seat?: boolean; // a place to sit: exactly here on every screen (no stepping back on phones)
};

// Clockwise, so "turn right" is the next entry: the board, the right, the tracks, the left
export const HEADINGS: Heading[] = ["front", "right", "back", "left"];
// Where each stop's heading turns up among the four
export const FOLD: Partial<Record<Heading, Heading>> = { table: "front", mail: "right", lockers: "left" };

// Where the visitor stands, and how they look along each heading. The camera looks
// down -z at yaw 0; the building's wall is at z = -2.2 and the tracks run along +z.
// A view with an object faces it (or its `aim`, on wide screens); these are the rest.
export const HUB = {
  pos: [-0.9, 1.6, 0.95] as [number, number, number],
  yaw: { front: 0, table: -0.6, mail: -0.9, right: -1.1, back: Math.PI, lockers: 0.9, left: 0.9 } as Record<Heading, number>,
  pitch: { front: 0.05, table: 0.02, mail: 0.02, right: 0.08, back: 0.04, lockers: 0.02, left: 0.04 } as Record<Heading, number>,
};

// `aim` is where a view looks (to take in a stretch of wall), on any screen
export const VIEWS: Record<Heading, { title: string; focus: StopId | null; aim?: [number, number, number] }> = {
  front: { title: "Wayside Station", focus: "bulletin", aim: [-0.9, 1.75, -2.2] },
  table: { title: "Flyer stand", focus: "events" },
  mail: { title: "Inbox", focus: "mail" },
  right: { title: "Ticket counter", focus: "tickets", aim: [3.1, 1.9, -1.3] },
  back: { title: "The tracks", focus: null },
  lockers: { title: "Left luggage", focus: "lockers" },
  // The bench at the end, the lockers, the arcade and the scoreboard over it
  left: { title: "Arcade cabinet", focus: "arcade", aim: [-4.4, 1.6, -1.0] },
};

export const STOPS: Record<StopId, Stop> = {
  // Sitting on the bench at the end of the platform, looking straight out: the scenic view
  bench: {
    id: "bench",
    label: "The bench",
    heading: "left",
    pos: [-5.75, 1.25, 0.3],
    target: [-9.75, 1.55, 0.3],
    seat: true,
  },
  lockers: {
    id: "lockers",
    label: "Left luggage",
    heading: "lockers",
    pos: [-5.3, 1.55, 0.4],
    target: [-5.3, 1.6, -2.0],
    fit: 2.0,
    fitHeight: 3.3,
  },
  arcade: {
    id: "arcade",
    label: "Arcade cabinet",
    heading: "left",
    pos: [-3.0, 1.55, 0.35],
    target: [-3.0, 1.3, -1.75],
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
    pos: [1.2, 1.75, 0.3],
    target: [1.2, 1.8, -1.9],
    fit: 2.1,
    fitHeight: 2.4,
    snug: true,
  },
  tickets: {
    id: "tickets",
    label: "Ticket counter",
    heading: "right",
    pos: [3.1, 1.6, 0],
    target: [5.25, 2.15, 0],
    fit: 2.3,
    fitHeight: 3.0,
  },
  departures: {
    id: "departures",
    label: "Scoreboard",
    heading: "left",
    pos: [-3.1, 2.75, 0.3],
    target: [-3.1, 2.4, -2.1],
    fit: 2.8,
    fitHeight: 1.4,
  },
  mail: {
    id: "mail",
    label: "Pigeonholes",
    heading: "mail",
    pos: [3.9, 1.5, 0.4],
    target: [3.9, 1.35, -2.0],
    fit: 3.4, // the pigeonholes and the register beside them
    fitHeight: 2.3,
  },
};

export const STOP_IDS = Object.keys(STOPS) as StopId[];

export const isStopId = (value: string | null): value is StopId =>
  value !== null && Object.prototype.hasOwnProperty.call(STOPS, value);

export const isHeading = (value: string | null): value is Heading =>
  value !== null && (HEADINGS as string[]).includes(value);

// Walks to an object, optionally opening something there (a tab, or a game in the arcade)
export type GoTo = (id: StopId, open?: string) => void;
