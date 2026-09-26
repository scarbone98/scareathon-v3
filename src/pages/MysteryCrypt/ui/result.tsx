// After a stage: what you kept, who levelled up and who joined.
import { Button, Panel } from "../../Royale/ui/parts";
import { PURPLE } from "../../Royale/ui/theme";
import { knownMoves, MOVES, stageDef, unitName, type UnitKind } from "../game/data";
import type { Save } from "../game/save";
import type { StageResult } from "../game/controller";
import { Candy, MoveIcon, UnitSprite } from "./parts";

interface Growth {
  kind: UnitKind;
  from: number;
  to: number;
}

function growth(before: Save, after: Save): Growth[] {
  const out: Growth[] = [];
  const hb = before.heroes[before.hero];
  const ha = after.heroes[after.hero];
  if (ha.level > hb.level) out.push({ kind: after.hero, from: hb.level, to: ha.level });
  for (const m of after.monsters) {
    const was = before.monsters.find((o) => o.uid === m.uid);
    if (was && m.level > was.level) out.push({ kind: m.kind, from: was.level, to: m.level });
  }
  return out;
}

export default function Result({ result, before, after, onCamp, onNext }: { result: StageResult; before: Save; after: Save; onCamp: () => void; onNext: () => void }) {
  const { report } = result;
  const def = stageDef(report.stage);
  const grown = growth(before, after);
  const nextIsNew = report.cleared && report.stage + 1 === after.cleared;
  return (
    <div className="absolute inset-0 flex flex-col items-center overflow-y-auto bg-[#0b0712]/80 px-5 py-4">
      <div className="my-auto flex w-full flex-col items-center">
        <div className="cc-pop cc-title text-center" style={{ fontSize: report.cleared ? 44 : 50, color: report.cleared ? "#ffcf4a" : PURPLE, textShadow: `0 4px 0 ${report.cleared ? "#8a5a00" : "#4a1a7a"}, 0 8px 0 #140a1c` }}>
          {report.cleared ? "STAGE CLEAR!" : "FAINTED"}
        </div>
        <div className="cc-outline-sm text-center text-[#ffe9c4]">{report.cleared ? `${def.name} beaten!` : `on B${report.floor}F of ${def.name}`}</div>
        <Panel gold className="cc-pop mt-4 w-full max-w-xs shrink-0" style={{ animationDelay: "0.15s" }}>
          <div className="cc-outline-sm flex items-center justify-between text-sm text-[#ffe9c4]">
            <span>Candy</span>
            {report.cleared ? <Candy amount={report.candy} /> : <span className="text-[#ff9a8a]">{report.candy.toLocaleString()} lost</span>}
          </div>
          <div className="cc-outline-sm mt-1 flex items-center justify-between text-sm text-[#ffe9c4]">
            <span>Monsters beaten</span>
            <span className="text-[#ffcf4a]">{result.kills}</span>
          </div>
          {report.recruits.length > 0 && (
            <>
              <div className="cc-outline-sm mt-2 text-xs uppercase tracking-widest text-[#ff9ad5]">Joined you</div>
              <div className="mt-1 flex flex-wrap gap-2">
                {report.recruits.map((r, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <UnitSprite kind={r.kind} size={30} />
                    <span className="cc-outline-sm text-[10px] text-white">
                      {unitName(r.kind)} {r.level}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {grown.length > 0 && (
            <>
              <div className="cc-outline-sm mt-2 text-xs uppercase tracking-widest text-[#7dffb0]">Levelled up</div>
              <ul className="mt-1 space-y-1">
                {grown.map((g, i) => {
                  const learned = knownMoves(g.kind, g.to).filter((m) => !knownMoves(g.kind, g.from).includes(m));
                  return (
                    <li key={i} className="cc-outline-sm flex items-center gap-2 text-sm text-white">
                      <UnitSprite kind={g.kind} size={20} animate={false} />
                      <span className="flex-1">
                        {unitName(g.kind)} <span className="text-[#ffe9c4]/70">{g.from}</span> → <span className="text-[#7dffb0]">{g.to}</span>
                      </span>
                      {learned.map((m) => (
                        <span key={m} className="flex items-center gap-0.5 text-[10px] text-[#ffcf4a]" title={MOVES[m].name}>
                          <MoveIcon move={m} size={16} />
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
        {nextIsNew && (
          <p className="cc-outline-sm mt-3 text-center text-sm text-[#ffcf4a]">
            New stage open: {stageDef(after.cleared).name}!
          </p>
        )}
        <Button color="orange" onClick={onNext} className="mt-4 w-full max-w-xs shrink-0 py-1 text-xl">
          {report.cleared ? (nextIsNew ? `Go to ${stageDef(after.cleared).name}` : "Play again") : "Try again"}
        </Button>
        <Button color="stone" onClick={onCamp} className="mt-2 w-full max-w-xs shrink-0 py-0 text-base">
          Back to camp
        </Button>
      </div>
    </div>
  );
}
