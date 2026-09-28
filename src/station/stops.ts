// The station's camera stops. "platform" is the overview; every other stop is one
// object on the platform. Each stop opens an existing page of the current site.

export type StopId = "platform" | "bulletin" | "arcade" | "events" | "departures" | "tickets";

export type Stop = {
  id: StopId;
  label: string;
  blurb: string;
  href?: string;
  cta?: string;
  pos: [number, number, number]; // camera position
  target: [number, number, number]; // what the camera looks at
};

// The wall of the station building sits at z = -2.2; close-ups stand on the platform in front of it.
export const STOPS: Record<StopId, Stop> = {
  platform: {
    id: "platform",
    label: "Platform",
    blurb: "Tap an object to look closer.",
    pos: [-9, 1.7, 0.3],
    target: [3, 1.5, -0.6],
  },
  bulletin: {
    id: "bulletin",
    label: "Bulletin board",
    blurb: "News, announcements and what's on.",
    href: "/announcements",
    cta: "Read the news",
    pos: [-5, 1.6, 0.5],
    target: [-5, 1.65, -2.1],
  },
  arcade: {
    id: "arcade",
    label: "Arcade cabinet",
    blurb: "Pick a cartridge, play, climb the leaderboards.",
    href: "/arcade",
    cta: "Play the arcade",
    pos: [-2, 1.4, 0.7],
    target: [-2, 1.3, -1.7],
  },
  events: {
    id: "events",
    label: "Events table",
    blurb: "Flyers for the events at the station.",
    href: "/scareathon",
    cta: "See Scareathon",
    pos: [1, 1.7, 1.0],
    target: [1, 0.85, -1.0],
  },
  departures: {
    id: "departures",
    label: "Departure board",
    blurb: "Standings, the calendar and what leaves next.",
    href: "/scareathon/scareboard",
    cta: "View the Scareboard",
    pos: [4, 2.2, 0.6],
    target: [4, 2.7, -2.1],
  },
  tickets: {
    id: "tickets",
    label: "Ticket window",
    blurb: "Spend your coins on avatar pieces and more.",
    href: "/profile/shop",
    cta: "Visit the shop",
    pos: [7, 1.6, 0.6],
    target: [7, 1.4, -1.8],
  },
};

export const STOP_IDS = Object.keys(STOPS) as StopId[];

export const isStopId = (value: string | null): value is StopId =>
  value !== null && Object.prototype.hasOwnProperty.call(STOPS, value);
