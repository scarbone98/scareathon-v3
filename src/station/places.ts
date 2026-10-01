import type { StopId } from "./stops.ts";

// Where an old (classic site) address lives in the station: the stop, and what to open
// there. Used for links clicked inside the station and for old addresses opened directly.
export function stationPlaceFor(path: string, search = ""): [StopId, string?] {
  if (path.startsWith("/profile/shop")) return ["tickets", "shop"];
  if (path.startsWith("/profile/avatar")) return ["lockers"];
  if (path.startsWith("/profile/inbox") || path.startsWith("/inbox")) return ["mail", "letters"];
  if (path.startsWith("/profile/settings")) return ["mail", "register"];
  if (path.startsWith("/profile")) return ["lockers"];
  if (path.startsWith("/authentication")) return ["tickets"];
  if (path.startsWith("/arcade")) return ["arcade", new URLSearchParams(search).get("game") ?? undefined];
  if (path.includes("scareboard")) return ["departures"];
  if (path.includes("calendar")) return ["events", "calendar"];
  if (path.includes("rules")) return ["events", "rules"];
  if (path.startsWith("/scareathon/today")) return ["events", "tonight"];
  if (path.startsWith("/scareathon")) return ["events"];
  return ["bulletin"];
}

export function stationUrlFor(path: string, search = "") {
  const [at, open] = stationPlaceFor(path, search);
  const params = new URLSearchParams({ at });
  if (open) params.set("open", open);
  return `/station?${params}`;
}
