// The site's two film events, and which one the station shows when. Scareathon is a horror
// film every night of October; Christmathon a Christmas film every night from December 1 to
// Christmas Day. The server keeps the same list (server/utils/scareathon.js, EVENTS); each
// event's watches and points are kept apart there by its id.
//
// The station features one event at a time: Christmathon from November 1 to December 31
// (counting down through November, its results after Christmas), Scareathon the rest of the year.

export type SeasonEventId = "scareathon" | "christmathon";

export type SeasonEvent = {
  id: SeasonEventId;
  name: string;
  // 0-based month it runs in, and its last night (it always starts on the 1st)
  monthIndex: number;
  lastDay: number;
  monthName: string;
  // "a horror film", "a Christmas film"
  film: string;
  // The night it builds up to
  finale: string;
  // What its standings are called
  board: string;
  // Its bonus point for dressing up on the last night
  dressUp: string;
};

export const SEASON_EVENTS: Record<SeasonEventId, SeasonEvent> = {
  scareathon: { id: "scareathon", name: "Scareathon", monthIndex: 9, lastDay: 31, monthName: "October", film: "a horror film", finale: "Halloween", board: "the Scareboard", dressUp: "Wear a costume on Halloween" },
  christmathon: { id: "christmathon", name: "Christmathon", monthIndex: 11, lastDay: 25, monthName: "December", film: "a Christmas film", finale: "Christmas", board: "the Christmathon standings", dressUp: "Wear a Christmas sweater on Christmas Day" },
};

// The event the station shows on this date (by the viewer's own clock)
export function featuredEvent(now = new Date()): SeasonEvent {
  return now.getMonth() >= 10 ? SEASON_EVENTS.christmathon : SEASON_EVENTS.scareathon;
}

// The API's ?event= for an event's calendar, watches and standings (Scareathon is the default)
export function eventQuery(event: SeasonEvent, joiner: "?" | "&" = "?") {
  return event.id === "scareathon" ? "" : `${joiner}event=${event.id}`;
}

// What the event is, in a line, before it starts, while it runs and once it's over
export function eventBlurb(event: SeasonEvent, isLive: boolean, isOver: boolean) {
  const until = event.id === "scareathon" ? "through Halloween" : "until Christmas";
  if (isOver) return `That's a wrap: ${event.film} every night ${until}. See who finished top of ${event.board}.`;
  return isLive
    ? `${event.film[0].toUpperCase()}${event.film.slice(1)} every night ${until}. Watch along, finish the weekly challenges, and climb ${event.board}.`
    : `Starting ${event.monthName} 1: ${event.film} every night ${until}, weekly challenges, and ${event.board} for the whole run.`;
}
