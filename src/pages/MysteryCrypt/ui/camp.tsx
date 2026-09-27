// The camp: pick a hero and a stage, choose which collected monsters come
// along and which moves everyone uses, and spend candy on items.
import { useState } from "react";
import { Button, Panel } from "../../Royale/ui/parts";
import { ORANGE } from "../../Royale/ui/theme";
import {
  HEROES,
  ITEMS,
  knownMoves,
  learnset,
  MAX_MOVES,
  MONSTERS,
  MOVES,
  stageDef,
  statsAt,
  unitName,
  type HeroId,
  type ItemId,
  type MoveId,
  type UnitKind,
} from "../game/data";
import { buyItem, equipMove, heroUnlocked, pickHero, releaseMonster, toggleTeam, type Save, type SavedMonster } from "../game/save";
import { xpToNext } from "../game/sim";
import { MAX_BAG, MAX_TEAM } from "../../../../server/shared/mysteryCrypt/save.js";
import { Bar, Candy, ItemIcon, MoveIcon, Row, UnitSprite } from "./parts";

export type Tab = "stages" | "team" | "shop";

const monsterName = (m: SavedMonster) => m.name ?? unitName(m.kind);

function Header({ save, signedIn, onClose }: { save: Save; signedIn: boolean; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <button type="button" onClick={onClose} aria-label="Close" className="cc-sbtn cc-sbtn-stone cc-outline-sm shrink-0 px-2 py-0 text-sm">
        <span>✕</span>
      </button>
      <div className="cc-title leading-none" style={{ fontSize: 26, color: ORANGE, textShadow: "0 2px 0 #8a3a00, 0 4px 0 #140a1c" }}>
        <span style={{ color: "#c88cff", textShadow: "0 2px 0 #4a1a7a, 0 4px 0 #140a1c" }}>MYSTERY</span> CRYPT
      </div>
      <div className="cc-outline-sm flex flex-col items-end text-sm">
        <Candy amount={save.candy} />
        {!signedIn && <span className="text-[10px] leading-tight text-[#ffe9c4]/70">Guest: saved on this device</span>}
      </div>
    </div>
  );
}

function HeroPicker({ save, onChange }: { save: Save; onChange: (s: Save) => void }) {
  return (
    <div className="mt-2 grid grid-cols-4 gap-1.5">
      {(Object.keys(HEROES) as HeroId[]).map((id) =>
        heroUnlocked(save, id) ? (
          <button
            key={id}
            type="button"
            onClick={() => onChange(pickHero(save, id))}
            className={`flex flex-col items-center rounded-md border-2 px-1 pb-0.5 pt-1 ${id === save.hero ? "border-[#ffcf4a] bg-[#3a2254]" : "border-[#140a1c] bg-[#1c1128]/80 opacity-70"}`}
          >
            <UnitSprite kind={id} size={28} animate={id === save.hero} />
            <span className="cc-outline-sm text-xs text-white">
              {HEROES[id].name} <span className="text-[#ffcf4a]">{save.heroes[id].level}</span>
            </span>
          </button>
        ) : (
          <div key={id} className="flex flex-col items-center justify-center rounded-md border-2 border-dashed border-[#ffe9c4]/20 px-1 py-1 opacity-60">
            <span className="cc-outline text-lg leading-none text-[#ffe9c4]/60">?</span>
            <span className="cc-outline-sm text-[10px] text-[#ffe9c4]/60">Missing</span>
          </div>
        )
      )}
    </div>
  );
}

function Tabs({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const tabs: [Tab, string][] = [
    ["stages", "Stages"],
    ["team", "Team"],
    ["shop", "Shop"],
  ];
  return (
    <div className="mt-2 grid grid-cols-3 gap-1">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onTab(id)}
          className={`cc-outline-sm rounded-t border-2 border-b-0 py-1 text-sm ${tab === id ? "border-[#ffcf4a] bg-[#3a2254] text-[#ffcf4a]" : "border-[#140a1c] bg-[#1c1128]/80 text-[#ffe9c4]"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function StageList({ save, selected, onSelect, story }: { save: Save; selected: number; onSelect: (i: number) => void; story: { stage: number; title: string; number: number } | null }) {
  const shown = Array.from({ length: save.cleared + 2 }, (_, i) => i);
  return (
    <div className="space-y-1.5">
      {shown.map((i) => {
        const def = stageDef(i);
        const locked = i > save.cleared;
        const cleared = i < save.cleared;
        return (
          <Row key={i} onClick={locked ? undefined : () => onSelect(i)} selected={i === selected} className={locked ? "opacity-50" : ""}>
            <div className="flex w-10 shrink-0 justify-center">{locked || !def.boss ? <span className="cc-outline text-2xl text-[#ffe9c4]/60">?</span> : <UnitSprite kind={def.boss} size={32} animate={i === selected} />}</div>
            <div className="min-w-0 flex-1">
              <div className="cc-outline-sm truncate text-white">
                {i + 1}. {locked ? "Locked" : def.name}
                {cleared && <span className="ml-1 text-[#7dffb0]">✓</span>}
              </div>
              {story?.stage === i && (
                <div className="cc-outline-sm text-[11px] leading-tight text-[#ffcf4a]">
                  ★ Story: Chapter {story.number}, {story.title}
                </div>
              )}
              <div className="cc-outline-sm truncate text-[11px] leading-tight text-[#ffe9c4]/80">
                {locked ? `Clear ${stageDef(i - 1).name} to open` : `${def.floors} floors · monsters Lv ${def.level}–${def.level + def.floors} · boss: ${def.bossName}`}
              </div>
            </div>
            {!locked && !cleared && (save.best[i] ?? 0) > 0 && <div className="cc-outline-sm shrink-0 text-[11px] text-[#ffcf4a]">best B{save.best[i]}F</div>}
          </Row>
        );
      })}
      <p className="cc-outline-sm px-1 pt-1 text-[11px] leading-snug text-[#ffe9c4]/70">
        Replay cleared stages to level up and recruit. If your hero faints you keep levels and recruits, but lose the candy and items found on the way.
      </p>
    </div>
  );
}

function MovesLine({ moves }: { moves: MoveId[] }) {
  return (
    <div className="flex gap-0.5">
      {moves.map((m) => (
        <MoveIcon key={m} move={m} size={18} />
      ))}
    </div>
  );
}

function TeamTab({ save, onChange, onDetail }: { save: Save; onChange: (s: Save) => void; onDetail: (uid: number | null) => void }) {
  const hero = save.heroes[save.hero];
  const team = save.team.map((uid) => save.monsters.find((m) => m.uid === uid)!).filter(Boolean);
  const box = [...save.monsters].sort((a, b) => b.level - a.level);
  return (
    <div>
      <Row onClick={() => onDetail(null)}>
        <UnitSprite kind={save.hero} size={30} />
        <div className="flex-1">
          <div className="cc-outline-sm text-white">
            {HEROES[save.hero].name} <span className="text-[#ffcf4a]">Lv {hero.level}</span> <span className="text-[11px] text-[#ffe9c4]/70">leader</span>
          </div>
          <MovesLine moves={hero.moves} />
        </div>
        <span className="cc-outline-sm text-xs text-[#ffe9c4]/70">Moves ›</span>
      </Row>
      <div className="mt-1.5 space-y-1.5">
        {Array.from({ length: MAX_TEAM }, (_, i) => team[i]).map((m, i) =>
          m ? (
            <Row key={m.uid} onClick={() => onDetail(m.uid)}>
              <UnitSprite kind={m.kind} size={30} />
              <div className="flex-1">
                <div className="cc-outline-sm text-white">
                  {monsterName(m)} <span className="text-[#ffcf4a]">Lv {m.level}</span>
                  {m.uid === save.story.partner && <span className="ml-1 text-[11px] text-[#ff9ad5]">partner</span>}
                </div>
                <MovesLine moves={m.moves} />
              </div>
              {m.uid !== save.story.partner && <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(toggleTeam(save, m.uid));
                }}
                className="cc-sbtn cc-sbtn-stone cc-outline-sm shrink-0 px-2 py-0 text-xs"
              >
                <span>Remove</span>
              </button>}
            </Row>
          ) : (
            <Row key={`empty-${i}`} className="justify-center border-dashed py-2.5">
              <span className="cc-outline-sm text-xs text-[#ffe9c4]/60">Empty slot: pick a monster below</span>
            </Row>
          )
        )}
      </div>
      <div className="cc-outline-sm mb-1 mt-3 flex justify-between text-xs uppercase tracking-widest text-[#ffe9c4]/70">
        <span>Crypt box</span>
        <span>{save.monsters.length}</span>
      </div>
      {box.length === 0 ? (
        <p className="cc-outline-sm py-3 text-center text-sm text-[#ffe9c4]/70">No monsters yet. Beat some in a stage and they may join you.</p>
      ) : (
        <div className="grid grid-cols-4 gap-1.5">
          {box.map((m) => (
            <button
              key={m.uid}
              type="button"
              onClick={() => onDetail(m.uid)}
              className={`flex flex-col items-center rounded border-2 pb-0.5 pt-1 ${save.team.includes(m.uid) ? "border-[#ffcf4a] bg-[#3a2254]" : "border-[#140a1c] bg-[#1c1128]/85"}`}
            >
              <UnitSprite kind={m.kind} size={28} animate={false} />
              <span className="cc-outline-sm text-[11px] text-white">Lv {m.level}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ShopTab({ save, onChange }: { save: Save; onChange: (s: Save) => void }) {
  const full = save.bag.length >= MAX_BAG;
  return (
    <div className="space-y-1.5">
      {(Object.keys(ITEMS) as ItemId[]).map((id) => {
        const item = ITEMS[id];
        const afford = save.candy >= item.price;
        return (
          <Row key={id}>
            <ItemIcon item={id} />
            <div className="min-w-0 flex-1">
              <div className="cc-outline-sm text-white">{item.name}</div>
              <div className="cc-outline-sm text-[11px] leading-tight text-[#ffe9c4]/80">{item.about}</div>
            </div>
            <Button color="green" disabled={!afford || full} onClick={() => onChange(buyItem(save, id, item.price))} className={`shrink-0 px-2 py-0 text-sm ${!afford || full ? "opacity-50" : ""}`}>
              <Candy amount={item.price} />
            </Button>
          </Row>
        );
      })}
      <div className="cc-outline-sm mt-2 text-xs uppercase tracking-widest text-[#ffe9c4]/70">
        Your bag {save.bag.length}/{MAX_BAG}
      </div>
      <div className="flex flex-wrap gap-1">
        {save.bag.length === 0 && <span className="cc-outline-sm text-sm text-[#ffe9c4]/60">Empty</span>}
        {save.bag.map((item, i) => (
          <ItemIcon key={i} item={item} />
        ))}
      </div>
      <p className="cc-outline-sm pt-1 text-[11px] leading-snug text-[#ffe9c4]/70">Beat stages to earn candy. Items you bring are kept if you faint; items found on the way are not.</p>
    </div>
  );
}

// A hero's or monster's stats and moves, with move swapping.
function Detail({ save, uid, onChange, onClose }: { save: Save; uid: number | null; onChange: (s: Save) => void; onClose: () => void }) {
  const monster = uid === null ? null : save.monsters.find((m) => m.uid === uid);
  const kind: UnitKind = monster ? monster.kind : save.hero;
  const unit = monster ?? save.heroes[save.hero];
  const [slot, setSlot] = useState(Math.min(unit.moves.length, MAX_MOVES - 1));
  const [confirmRelease, setConfirmRelease] = useState(false);
  if (uid !== null && !monster) return null;
  const stats = statsAt(kind, unit.level);
  const known = knownMoves(kind, unit.level);
  const spare = known.filter((m) => !unit.moves.includes(m));
  const nextMove = learnset(kind).find(([at]) => at > unit.level);
  const inTeam = monster ? save.team.includes(monster.uid) : true;
  const partner = !!monster && monster.uid === save.story.partner;
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0712]/80 px-4 py-4" onClick={onClose}>
      <Panel className="cc-pop max-h-full w-full max-w-sm overflow-y-auto">
        <div onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded bg-[#1c1128]">
              <UnitSprite kind={kind} size={48} />
            </div>
            <div className="flex-1">
              <div className="cc-outline text-xl text-white">
                {monster ? monsterName(monster) : unitName(kind)} <span className="text-[#ffcf4a]">Lv {unit.level}</span>
              </div>
              <div className="cc-outline-sm text-xs text-[#ffe9c4]">
                HP {stats.hp} · ATK {Math.round(stats.atk)} · DEF {Math.round(stats.def)}
                {monster && <> · joins {Math.round(MONSTERS[monster.kind].recruit * 100)}%</>}
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span className="cc-outline-sm text-[10px] text-[#ffe9c4]/70">XP</span>
                <Bar value={unit.xp} max={xpToNext(unit.level)} from="#6ae0ff" to="#c88cff" className="h-2" />
              </div>
            </div>
          </div>
          <div className="cc-outline-sm mb-1 mt-3 text-xs uppercase tracking-widest text-[#ffe9c4]/70">Moves (tap a slot, then a move to put in it)</div>
          <div className="grid grid-cols-2 gap-1.5">
            {Array.from({ length: MAX_MOVES }, (_, i) => unit.moves[i]).map((m, i) => (
              <Row key={i} onClick={() => setSlot(i)} selected={slot === i} className="p-1">
                {m ? <MoveIcon move={m} size={26} /> : <div className="h-[26px] w-[26px] rounded border-2 border-dashed border-[#ffe9c4]/30" />}
                <div className="min-w-0">
                  <div className="cc-outline-sm truncate text-xs text-white">{m ? MOVES[m].name : "Empty"}</div>
                  {m && <div className="cc-outline-sm text-[10px] text-[#ffe9c4]/70">{MOVES[m].pp} uses</div>}
                </div>
              </Row>
            ))}
          </div>
          {slot < MAX_MOVES && unit.moves[slot] && <p className="cc-outline-sm mt-1 text-[11px] leading-tight text-[#ffe9c4]/80">{MOVES[unit.moves[slot]].about}</p>}
          {spare.length > 0 && (
            <>
              <div className="cc-outline-sm mb-1 mt-2 text-xs uppercase tracking-widest text-[#ffe9c4]/70">Also knows</div>
              <div className="space-y-1">
                {spare.map((m) => (
                  <Row key={m} onClick={() => onChange(equipMove(save, uid, slot, m))} className="p-1">
                    <MoveIcon move={m} size={24} />
                    <div className="min-w-0 flex-1">
                      <div className="cc-outline-sm text-xs text-white">{MOVES[m].name}</div>
                      <div className="cc-outline-sm truncate text-[10px] text-[#ffe9c4]/70">{MOVES[m].about}</div>
                    </div>
                    <span className="cc-outline-sm text-[10px] text-[#ffcf4a]">Equip</span>
                  </Row>
                ))}
              </div>
            </>
          )}
          {nextMove && (
            <p className="cc-outline-sm mt-2 text-[11px] text-[#ffe9c4]/70">
              Learns {MOVES[nextMove[1]].name} at Lv {nextMove[0]}.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {monster && !partner && (
              <Button color={inTeam ? "stone" : "purple"} onClick={() => onChange(toggleTeam(save, monster.uid))} className="flex-1 py-0 text-sm" disabled={!inTeam && save.team.length >= MAX_TEAM}>
                {inTeam ? "Remove from team" : save.team.length >= MAX_TEAM ? "Team full" : "Add to team"}
              </Button>
            )}
            <Button color="stone" onClick={onClose} className="flex-1 py-0 text-sm">
              Done
            </Button>
          </div>
          {monster &&
            !partner &&
            (confirmRelease ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="cc-outline-sm flex-1 text-xs text-[#ff9a8a]">Release it for good?</span>
                <Button
                  color="orange"
                  onClick={() => {
                    onChange(releaseMonster(save, monster.uid));
                    onClose();
                  }}
                  className="px-2 py-0 text-xs"
                >
                  Release
                </Button>
                <Button color="stone" onClick={() => setConfirmRelease(false)} className="px-2 py-0 text-xs">
                  Keep
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRelease(true)} className="cc-outline-sm mt-2 w-full text-center text-[11px] text-[#ffe9c4]/50 underline">
                Release this monster
              </button>
            ))}
        </div>
      </Panel>
    </div>
  );
}

export default function Camp({
  save,
  signedIn,
  initialTab,
  story,
  onChange,
  onEnter,
  onClose,
}: {
  save: Save;
  signedIn: boolean;
  initialTab: Tab;
  // The chapter to play next, marked on its stage.
  story: { stage: number; title: string; number: number } | null;
  onChange: (s: Save) => void;
  onEnter: (stage: number) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [stage, setStage] = useState(story?.stage ?? save.cleared);
  const [detail, setDetail] = useState<number | null | undefined>(undefined);
  const selected = Math.min(stage, save.cleared);
  const def = stageDef(selected);
  const storyRun = story?.stage === selected;
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-[#0b0712]/85 px-3 pb-3 pt-3">
      <Header save={save} signedIn={signedIn} onClose={onClose} />
      <HeroPicker save={save} onChange={onChange} />
      <Tabs tab={tab} onTab={setTab} />
      <div className="-mt-px min-h-0 flex-1 overflow-y-auto rounded-b rounded-tr border-2 border-[#ffcf4a]/60 bg-[#0b0712]/70 p-2">
        {tab === "stages" && <StageList save={save} selected={selected} onSelect={setStage} story={story} />}
        {tab === "team" && <TeamTab save={save} onChange={onChange} onDetail={setDetail} />}
        {tab === "shop" && <ShopTab save={save} onChange={onChange} />}
      </div>
      <Button color="orange" onClick={() => onEnter(selected)} className="cc-shine relative mt-2 w-full shrink-0 overflow-hidden py-1 text-xl">
        {storyRun ? `Chapter ${story!.number}: ${story!.title}` : `Enter ${def.name}`}
      </Button>
      <div className="cc-outline-sm mt-1 flex shrink-0 items-center justify-center gap-1.5 text-[11px] text-[#ffe9c4]/80">
        <UnitSprite kind={storyRun ? "alex" : save.hero} size={16} animate={false} />
        {save.team.map((uid) => {
          const m = save.monsters.find((o) => o.uid === uid);
          return m ? <UnitSprite key={uid} kind={m.kind} size={16} animate={false} /> : null;
        })}
        <span>
          {save.team.length + 1} going · {save.bag.length} item{save.bag.length === 1 ? "" : "s"}
        </span>
      </div>
      {detail !== undefined && <Detail save={save} uid={detail} onChange={onChange} onClose={() => setDetail(undefined)} />}
    </div>
  );
}
