// The station's layout. The visitor stands on the platform (the hub) and turns between
// headings, Inscryption-style; each object is a close-up stop they walk up to. Everything
// stands against the station building's wall, left to right: the left-luggage lockers,
// the arcade cabinet, the station board, the events table, the ticket kiosk (with the
// departure board above it) and the pigeonhole wall.

export type StopId = "lockers" | "arcade" | "bulletin" | "events" | "tickets" | "departures" | "mail";
export type Heading = "front" | "table" | "right" | "mail" | "back" | "lockers" | "left";

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
export const HEADINGS: Heading[] = ["front", "right", "back", "left"];
export const PHONE_HEADINGS: Heading[] = ["front", "table", "right", "mail", "back", "lockers", "left"];

// Where the visitor stands, and how they look along each heading. The camera looks
// down -z at yaw 0; the building's wall is at z = -2.2 and the tracks run along +z.
// A view with an object faces it (or its `aim`, on wide screens); these are the rest.
export const HUB = {
  pos: [0, 1.6, 2.2] as [number, number, number],
  yaw: { front: 0, table: -0.6, right: -0.9, mail: -1.1, back: Math.PI, lockers: 1.0, left: 0.8 } as Record<Heading, number>,
  pitch: { front: 0.05, table: 0.02, right: 0.12, mail: 0.02, back: -0.06, lockers: 0.02, left: 0.02 } as Record<Heading, number>,
};

// `aim` is where a wide screen looks (to take in a stretch of wall); tall screens look
// straight at the view's object
export const VIEWS: Record<Heading, { title: string; focus: StopId | null; aim?: [number, number, number] }> = {
  front: { title: "Wayside Station", focus: "bulletin", aim: [0.3, 1.8, -2.2] },
  table: { title: "Events table", focus: "events" },
  right: { title: "Ticket kiosk", focus: "tickets", aim: [5.9, 1.9, -2.2] },
  mail: { title: "Pigeonholes", focus: "mail" },
  back: { title: "The tracks", focus: null },
  lockers: { title: "Left luggage", focus: "lockers" },
  left: { title: "Arcade cabinet", focus: "arcade", aim: [-5.0, 1.5, -2.2] },
};

export const STOPS: Record<StopId, Stop> = {
  lockers: {
    id: "lockers",
    label: "Left luggage",
    heading: "lockers",
    pos: [-6.4, 1.55, 0.4],
    target: [-6.4, 1.3, -2.0],
    fit: 2.2,
    fitHeight: 2.4,
  },
  arcade: {
    id: "arcade",
    label: "Arcade cabinet",
    heading: "left",
    pos: [-3.6, 1.55, 0.35],
    target: [-3.6, 1.3, -1.75],
  },
  bulletin: {
    id: "bulletin",
    label: "Station board",
    heading: "front",
    pos: [-0.9, 1.9, 0.35],
    target: [-0.9, 2.02, -2.1],
    // The tall board and its sign: just their width across a phone, so they fill most of it
    fit: 2.2,
    fitHeight: 3.55,
    snug: true,
  },
  events: {
    id: "events",
    label: "Events table",
    heading: "table",
    pos: [1.9, 1.75, 0.2],
    target: [1.9, 1.5, -1.6],
    fit: 1.8,
    fitHeight: 2.0,
  },
  tickets: {
    id: "tickets",
    label: "Ticket kiosk",
    heading: "right",
    pos: [4.5, 1.6, 0.2],
    target: [4.5, 1.65, -1.3],
    fit: 1.35,
    fitHeight: 1.5,
  },
  departures: {
    id: "departures",
    label: "Departure board",
    heading: "right",
    pos: [4.5, 2.9, 0.4],
    target: [4.5, 3.3, -2.1],
    fit: 2.8,
    fitHeight: 1.4,
  },
  mail: {
    id: "mail",
    label: "Pigeonholes",
    heading: "mail",
    pos: [7.75, 1.5, 0.4],
    target: [7.75, 1.35, -2.0],
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
