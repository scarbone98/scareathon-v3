// Menu screens: home, deck picker and training setup.
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { PRESET_DECKS, type Difficulty } from "../game/decks";
import { Button, Character, GameCard, Graveyard, Heading, Panel, Skulls, Sprite, Title } from "./parts";
import { SPRITES, avgCost, useScreenScale } from "./theme";

export function Screen({ children, onBack, title }: { children: ReactNode; onBack?: () => void; title?: string }) {
  return (
    <div className="relative flex h-full flex-col overflow-y-auto overflow-x-hidden">
      <div className="flex items-center gap-3 px-3 pt-3">
        {onBack && (
          <Button color="stone" onClick={onBack} className="px-1 text-sm" aria-label="Back">
            ◀
          </Button>
        )}
        {title && <Heading>{title}</Heading>}
      </div>
      {children}
    </div>
  );
}

export function NameEditor({ name, onChange }: { name: string; onChange: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <Panel className="flex items-center gap-2 px-1">
      <Sprite sprite={SPRITES.joe} size={34} fps={7} />
      {editing ? (
        <input
          autoFocus
          value={name}
          maxLength={20}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
          className="w-32 rounded bg-black/40 px-1 text-white outline-none"
        />
      ) : (
        <button onClick={() => setEditing(true)} className="cc-outline-sm max-w-[9rem] truncate text-left text-white">
          {name} <span className="text-xs text-[#ffcf4a]">✎</span>
        </button>
      )}
    </Panel>
  );
}

export function DeckStrip({ cards, width = 34 }: { cards: string[]; width?: number }) {
  return (
    <div className="flex justify-center gap-2 pl-2 pt-2">
      {cards.map((id) => (
        <GameCard key={id} id={id} width={width} animate={false} />
      ))}
    </div>
  );
}

export function HomeScreen({
  name,
  onName,
  deckId,
  onPlayFriend,
  onTraining,
  onDecks,
}: {
  name: string;
  onName: (name: string) => void;
  deckId: string;
  onPlayFriend: () => void;
  onTraining: () => void;
  onDecks: () => void;
}) {
  const deck = PRESET_DECKS.find((d) => d.id === deckId) ?? PRESET_DECKS[0];
  const rootRef = useRef<HTMLDivElement>(null);
  const k = useScreenScale(rootRef);
  const buttonFont = { fontSize: 20 * k };
  return (
    <div ref={rootRef} className="relative flex h-full flex-col overflow-hidden">
      <div className="flex items-start justify-between px-3 pt-3">
        <Link to="/" className="cc-sbtn cc-sbtn-stone cc-outline-sm px-1 text-sm" aria-label="Leave">
          <span>◀</span>
        </Link>
        <NameEditor name={name} onChange={onName} />
      </div>

      {/* Title and buttons share the space above the graveyard, spread out on tall screens. */}
      <div className="flex flex-1 flex-col items-center justify-evenly">
        <div className="flex items-end justify-center gap-1">
          <Sprite sprite={SPRITES.lamp} size={112 * k} fps={6} />
          <Title scale={k} />
          <Sprite sprite={SPRITES.lamp} size={112 * k} fps={6} flip />
        </div>

        <div className="flex w-full flex-col px-4" style={{ maxWidth: 320 * k, gap: 18 * k * k }}>
          <Button color="orange" onClick={onPlayFriend} style={{ ...buttonFont, paddingBlock: 4 * k }}>
            <span className="leading-none" style={{ fontSize: 26 * k }}>
              ⚔
            </span>{" "}
            Battle a friend
          </Button>
          <Button color="purple" onClick={onTraining} style={{ ...buttonFont, paddingBlock: 4 * k }}>
            <Sprite sprite={SPRITES.skull} size={26 * k} /> Training
          </Button>
          <Button color="green" onClick={onDecks} style={{ ...buttonFont, paddingBlock: 4 * k }}>
            <Sprite sprite={SPRITES.chest} size={28 * k} animate={false} />
            <span className="flex flex-col items-start leading-tight">
              Decks
              <span className="normal-case tracking-normal text-[#e6ffe0]" style={{ fontSize: 10 * k }}>
                {deck.name}
              </span>
            </span>
          </Button>
        </div>
      </div>

      <Graveyard scale={k}>
        <Character sprite={SPRITES.joe} size={64 * k} />
        <Character sprite={SPRITES.matt} size={64 * k} flip />
      </Graveyard>
    </div>
  );
}

export function DecksScreen({ deckId, onPick, onBack }: { deckId: string; onPick: (id: string) => void; onBack: () => void }) {
  const index = Math.max(0, PRESET_DECKS.findIndex((d) => d.id === deckId));
  const deck = PRESET_DECKS[index];
  const shift = (by: number) => onPick(PRESET_DECKS[(index + by + PRESET_DECKS.length) % PRESET_DECKS.length].id);
  return (
    <Screen onBack={onBack} title="Decks">
      <div className="mx-auto mt-4 w-full max-w-sm px-3">
        <Panel className="px-1 pb-2">
          <div className="flex items-center justify-between gap-2">
            <Button color="stone" onClick={() => shift(-1)} className="px-1 text-sm" aria-label="Previous deck">
              ◀
            </Button>
            <div className="text-center">
              <div className="cc-outline text-xl font-bold text-[#ffcf4a]">{deck.name}</div>
              <div className="text-[11px] text-white/70">{deck.blurb}</div>
            </div>
            <Button color="stone" onClick={() => shift(1)} className="px-1 text-sm" aria-label="Next deck">
              ▶
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-4 justify-items-center gap-x-2 gap-y-4 pl-2">
            {deck.cards.map((id) => (
              <GameCard key={id} id={id} width={68} />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/80">
            <span className="cc-gem cc-outline-sm flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white">{avgCost(deck.cards).toFixed(1)}</span>
            average elixir
          </div>
        </Panel>
        <div className="mt-3 flex justify-center gap-1.5">
          {PRESET_DECKS.map((d, i) => (
            <span key={d.id} className={`h-2.5 w-2.5 border-2 border-[#140a1c] ${i === index ? "bg-[#ffcf4a]" : "bg-[#3a2850]"}`} />
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-white/50">This deck is used for training and friend battles. Build your own decks soon.</p>
        <Button color="green" onClick={onBack} className="mt-3 w-full py-1 text-lg">
          ✓ Use this deck
        </Button>
      </div>
    </Screen>
  );
}

const LEVELS: { id: Difficulty; name: string; skulls: number; blurb: string }[] = [
  { id: "easy", name: "Grave Digger", skulls: 1, blurb: "Slow and forgiving." },
  { id: "normal", name: "Crypt Keeper", skulls: 2, blurb: "Knows its counters." },
  { id: "hard", name: "Lich Lord", skulls: 3, blurb: "Reacts in a heartbeat." },
];

export function TrainingScreen({ deckId, onStart, onDecks, onBack }: { deckId: string; onStart: (difficulty: Difficulty) => void; onDecks: () => void; onBack: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const deck = PRESET_DECKS.find((d) => d.id === deckId) ?? PRESET_DECKS[0];
  return (
    <Screen onBack={onBack} title="Training">
      <div className="mx-auto mt-4 flex w-full max-w-sm flex-col gap-3 px-3">
        {LEVELS.map((level) => (
          <button key={level.id} onClick={() => setDifficulty(level.id)} className="text-left">
            <Panel gold={difficulty === level.id} className="flex items-center gap-3 px-1">
              <div className="w-20">
                <Skulls count={level.skulls} active={difficulty === level.id} />
              </div>
              <div>
                <div className={`cc-outline-sm text-lg font-bold ${difficulty === level.id ? "text-[#ffcf4a]" : "text-white"}`}>{level.name}</div>
                <div className="text-[11px] text-white/60">{level.blurb}</div>
              </div>
            </Panel>
          </button>
        ))}
        <button onClick={onDecks} className="text-left">
          <Panel className="px-1">
            <div className="flex items-center justify-between text-sm">
              <span className="cc-outline-sm text-white">
                Deck: <span className="text-[#ffcf4a]">{deck.name}</span>
              </span>
              <span className="text-xs text-white/60">change ▶</span>
            </div>
            <DeckStrip cards={deck.cards} width={30} />
          </Panel>
        </button>
        <Button color="orange" onClick={() => onStart(difficulty)} className="mt-2 py-2 text-2xl">
          ▶ Fight!
        </Button>
      </div>
    </Screen>
  );
}
