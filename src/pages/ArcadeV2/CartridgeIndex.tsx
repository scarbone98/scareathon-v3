import { useEffect, useMemo, useState } from "react";
import { byName, type MachineData } from "../Arcade/games.tsx";
import { stillUrlFor } from "./cartridge.ts";
import { hasNews, isNewGame, playedCarts } from "../Arcade/news.ts";

// Every cartridge at once, as a green-screen directory listing: a grid of the
// games' stills and names in alphabetical order, a row of filters behind a FILTER button (genre, developer,
// single or multiplayer, early access, coming soon), and a search prompt along the bottom that filters
// by name or genre. Picking one jumps the shelf to it. Games in their first day come first,
// under NEW GAMES, and anything new or updated wears a "!" badge until it's played (Arcade/news.ts).

const PHOSPHOR = "#39ff6a";
const TERMINAL_FAMILY = `"VT323", ui-monospace, Menlo, Consolas, monospace`;
const GLOW = "0 0 6px rgba(57, 255, 106, 0.65), 0 0 1px rgba(57, 255, 106, 0.9)";

const INVERT = "focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]";

// One player, or more than one (everyone's in it together counts); "???" is neither
const PLAYERS = ["Single player", "Multiplayer"];
const playersOf = (game: MachineData) => (/^single player$/i.test(game.cartridge.about.players) ? PLAYERS[0] : /^unknown$/i.test(game.cartridge.about.players) ? "" : PLAYERS[1]);
// "sclondon + scarbone98" is both of them
const developersOf = (game: MachineData) => game.cartridge.about.developer.split("+").map((name) => name.trim());
// How far along a game is, for the order they're listed in: finished, early access, coming soon, "???"
const readiness = (game: MachineData) => (game.special === "mystery" ? 3 : game.special === "soon" ? 2 : game.earlyAccess ? 1 : 0);
const unique = (values: string[]) => [...new Set(values)].filter((value) => value !== "UNKNOWN").sort((a, b) => a.localeCompare(b));

// A filter that's on or off: lit when it's on
function Toggle({ on, onChange, children }: { on: boolean; onChange: (on: boolean) => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`shrink-0 whitespace-nowrap px-1.5 ${INVERT}`}
      style={on ? { background: PHOSPHOR, color: "#021407", textShadow: "none" } : undefined}
    >
      [ {children} ]
    </button>
  );
}

// A filter with a list to pick from
function Pick({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="flex shrink-0 items-center gap-1 whitespace-nowrap">
      {label}:
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-[11rem] cursor-pointer border border-[#39ff6a]/40 bg-[#021407] px-1 uppercase outline-none focus-visible:border-[#39ff6a]"
        style={{ color: PHOSPHOR, fontFamily: TERMINAL_FAMILY, textShadow: GLOW }}
      >
        <option value="">ALL</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

type Props = {
  games: MachineData[];
  current: number;
  onPick: (index: number) => void;
  onClose: () => void;
};

export default function CartridgeIndex({ games, current, onPick, onClose }: Props) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("");
  const [developer, setDeveloper] = useState("");
  const [players, setPlayers] = useState("");
  const [early, setEarly] = useState(false);
  const [soon, setSoon] = useState(false);
  // The filters are tucked away until asked for
  const [filtersOpen, setFiltersOpen] = useState(false);
  const needle = query.trim().toLowerCase();
  // The finished games first, then the ones in early access, then the ones still to come
  // ("???" last of all), each lot alphabetical, whatever order the shelf's in. Each keeps its
  // place in the full list: that's what onPick takes
  const listed = useMemo(
    () => games.map((game, index) => ({ game, index })).sort((a, b) => readiness(a.game) - readiness(b.game) || byName(a.game, b.game)),
    [games]
  );
  const genres = useMemo(() => unique(games.map((game) => game.cartridge.about.genre)), [games]);
  const developers = useMemo(() => unique(games.flatMap(developersOf)), [games]);
  // Early access and coming soon together show both kinds
  const shown = listed.filter(
    ({ game }) =>
      (!needle || `${game.name} ${game.cartridge.about.genre}`.toLowerCase().includes(needle)) &&
      (!genre || game.cartridge.about.genre === genre) &&
      (!developer || developersOf(game).includes(developer)) &&
      (!players || playersOf(game) === players) &&
      ((!early && !soon) || (early && Boolean(game.earlyAccess)) || (soon && game.special === "soon"))
  );
  // New games first, under a heading of their own
  const fresh = shown.filter(({ game }) => isNewGame(game));
  const sections = fresh.length ? [{ title: "NEW GAMES", carts: fresh }, { title: "ALL GAMES", carts: shown.filter(({ game }) => !isNewGame(game)) }] : [{ title: "", carts: shown }];
  const played = useMemo(playedCarts, []);
  const filtersOn = [genre, developer, players, early, soon].filter(Boolean).length;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="All games"
      className="fixed inset-0 z-40 flex flex-col p-2 sm:p-6 md:pt-24"
      style={{ background: "rgba(0, 0, 0, 0.7)" }}
      onClick={onClose}
    >
      {/* The terminal's glass, filling the screen (below the site nav on wide screens, which sits over everything) */}
      <div
        className="relative mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col overflow-hidden rounded-2xl border-[10px] border-[#b9ab8e]"
        style={{
          background: "radial-gradient(ellipse at center, #06260f 0%, #021407 70%, #010a04 100%)",
          boxShadow: "inset 0 0 30px rgba(0,0,0,0.9), 0 10px 40px rgba(0,0,0,0.7)",
          color: PHOSPHOR,
          fontFamily: TERMINAL_FAMILY,
          textShadow: GLOW,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3 text-2xl leading-none">
          <span className="truncate">{`> CARTS: ${shown.length}`}</span>
          <div className="flex shrink-0 items-center gap-1 leading-6">
            {/* Shows or hides the filters (which stay on while hidden: it counts them) */}
            <Toggle on={filtersOpen} onChange={setFiltersOpen}>
              {filtersOn ? `FILTER:${filtersOn}` : "FILTER"}
            </Toggle>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 whitespace-nowrap px-1.5 leading-6 focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]"
            >
              [ X ]
            </button>
          </div>
        </div>
        {filtersOpen ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-2 border-[#39ff6a]/30 px-4 pb-2 pt-1 text-lg leading-6 sm:text-xl">
            <Pick label="GENRE" value={genre} options={genres} onChange={setGenre} />
            <Pick label="DEV" value={developer} options={developers} onChange={setDeveloper} />
            <Pick label="PLAYERS" value={players} options={PLAYERS} onChange={setPlayers} />
            <Toggle on={early} onChange={setEarly}>
              EARLY ACCESS
            </Toggle>
            <Toggle on={soon} onChange={setSoon}>
              COMING SOON
            </Toggle>
          </div>
        ) : (
          <div className="border-b-2 border-[#39ff6a]/30 pt-1" />
        )}
        <ul className=
"grid min-h-0 flex-1 grid-cols-3 content-start gap-2 overflow-y-auto p-3 sm:gap-3 sm:p-4 md:grid-cols-4">
          {shown.length === 0 && <li className="col-span-full py-6 text-xl">{needle ? `NO CARTRIDGE MATCHES "${query.toUpperCase()}"` : "NO CARTRIDGE MATCHES"}</li>}
          {sections.flatMap(({ title, carts }) => [
            title && carts.length > 0 && (
              <li key={title} className="col-span-full text-xl leading-6">
                {`> ${title}`}
              </li>
            ),
            ...carts.map(({ game, index }) => {
            const soon = game.special === "soon";
            const stamp = soon ? "COMING SOON" : game.earlyAccess ? "EARLY ACCESS" : "";
            return (
              <li key={game.name}>
                <button
                  type="button"
                  onClick={() => onPick(index)}
                  aria-current={index === current || undefined}
                  className="group flex w-full flex-col overflow-hidden rounded-md border-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#39ff6a]"
                  style={{ borderColor: index === current ? PHOSPHOR : "rgba(57, 255, 106, 0.25)", textShadow: "none", opacity: soon ? 0.75 : undefined }}
                >
                  <div className="h-1.5" style={{ background: soon ? "#4c4c52" : game.cartridge.color }} />
                  <div className="relative aspect-video w-full bg-black">
                    {game.videoUrl && (
                      <img
                        src={stillUrlFor(game.videoUrl)}
                        alt=""
                        loading="lazy"
                        className={`absolute inset-0 h-full w-full object-cover transition-opacity ${
                          soon ? "opacity-50 grayscale" : "opacity-85 [@media(hover:hover)]:group-hover:opacity-100"
                        }`}
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    )}
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0"
                      style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.3) 0 1px, transparent 1px 3px)" }}
                    />
                    {/* Something new here, not played yet: a yellow dot with a red "!" */}
                    {hasNews(game, played) && (
                      <span
                        aria-label="New or updated"
                        className="absolute right-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded-full border border-[#3a2a00] bg-[#ffd21f] text-base font-bold leading-none text-[#e0201b] sm:h-5 sm:w-5 sm:text-lg"
                        style={{ fontFamily: "ui-sans-serif, system-ui, sans-serif", boxShadow: "0 0 6px rgba(255, 210, 31, 0.8)" }}
                      >
                        !
                      </span>
                    )}
                    {/* Not made yet, or not finished: stamped across the corner-to-corner diagonal */}
                    {stamp && (
                      <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
                        <span
                          className="whitespace-nowrap border-y-2 px-[30%] py-0.5 text-base leading-5 sm:text-2xl sm:leading-7"
                          style={{
                            transform: "rotate(-29deg)",
                            color: "#fff4e0",
                            borderColor: PHOSPHOR,
                            background: "rgba(2, 20, 7, 0.85)",
                            textShadow: GLOW,
                          }}
                        >
                          {stamp}
                        </span>
                      </div>
                    )}
                  </div>
                  <span
                    className="truncate px-1.5 py-0.5 text-base leading-5 sm:px-2 sm:py-1 sm:text-lg"
                    style={{ color: PHOSPHOR, textShadow: GLOW, background: index === current ? "rgba(57, 255, 106, 0.15)" : undefined }}
                  >
                    {index === current ? "> " : ""}
                    {game.name.replace(/[‘’]/g, "'").toUpperCase()}
                  </span>
                </button>
              </li>
            );
            }),
          ])}
        </ul>
        {/* The search prompt */}
        <label className="flex items-center gap-2 border-t-2 border-[#39ff6a]/30 px-4 py-2 text-2xl leading-none">
          <span aria-hidden="true">{"> SEARCH:"}</span>
          <input
            type="text"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              // Enter picks the first match
              if (event.key === "Enter" && shown.length > 0) onPick(shown[0].index);
            }}
            aria-label="Search games"
            placeholder="_"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent uppercase caret-[#39ff6a] outline-none placeholder:text-[#39ff6a]/50"
            style={{ color: PHOSPHOR, fontFamily: TERMINAL_FAMILY, textShadow: GLOW }}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 px-1.5 leading-6 focus:outline-none focus-visible:bg-[#39ff6a] focus-visible:text-[#021407] [@media(hover:hover)]:hover:bg-[#39ff6a] [@media(hover:hover)]:hover:text-[#021407]"
            >
              [ CLR ]
            </button>
          )}
        </label>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: "repeating-linear-gradient(to bottom, rgba(0,0,0,0.22) 0 1px, transparent 1px 3px)" }}
        />
      </div>
    </div>
  );
}
