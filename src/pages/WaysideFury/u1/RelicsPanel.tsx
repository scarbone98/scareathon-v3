import type { GameState } from "../game/sim";
import { itemsState } from "../game/u1/items/chips";
import { RELICS, availableWishes, readyToSummon } from "../game/u1/items/relics";
import "./relics.css";

interface Props {
  state: GameState;
  onWish: (id: string) => void;
}

const AREA_NAMES: Record<string, string> = {
  wayside: "Wayside Station", blast: "Blast Site", "eightbit-realm": "8-Bit Realm",
  realm: "8-Bit Realm", forest: "Hollow Woods", city: "Old City", frost: "Frozen Reach", final: "Final chapter",
};

export function RelicsPanel({ state, onWish }: Props) {
  const relics = itemsState(state).relics;
  const ready = readyToSummon(state), complete = relics.collected.length === RELICS.length;
  return <section className="wf-relic-panel" aria-labelledby="wf-relics-title">
    <div className="wf-items-heading"><div><p className="wf-eyebrow">SEVEN WAYSIDE RELICS</p><h3 id="wf-relics-title">A wish between worlds</h3></div><span className="wf-items-count">{relics.collected.length} / {RELICS.length}</span></div>
    <p className="wf-small">Find one relic in each area. Bring all seven to the station plaza to summon a wish.</p>
    <ol className="wf-relic-list" aria-label="Wayside relic collection">
      {RELICS.map((relic, index) => {
        const found = relics.collected.includes(relic.id);
        return <li className={`${found ? "is-found" : ""} ${relic.locked ? "is-future" : ""}`} key={relic.id}>
          <span className="wf-relic-glyph" aria-hidden="true">{found ? "✦" : "◇"}<small>{index + 1}</small></span>
          <span><strong>{relic.locked ? "Uncharted relic" : relic.name}</strong><small>{relic.locked ? "A later chapter" : AREA_NAMES[relic.area] ?? relic.area}</small></span>
          <span className="wf-relic-status">{found ? "Found" : relic.locked ? "Sealed" : "Missing"}</span>
        </li>;
      })}
    </ol>
    <div className={`wf-wish-altar ${ready ? "is-ready" : ""}`}>
      <div className="wf-wish-heading"><span aria-hidden="true">✧</span><div><h4>Station wish altar</h4><p className="wf-small">Cycle {relics.cycle + 1} · {ready ? "The seven relics are resonating." : complete ? "Return to the station plaza to summon." : `${RELICS.length - relics.collected.length} relics still to find.`}</p></div></div>
      <div className="wf-wish-options">{availableWishes(state).map(wish => <button className="wf-secondary wf-wish-option" key={wish.id} disabled={!ready} onClick={() => onWish(wish.id)}>
        <span aria-hidden="true">{wish.kind === "outfit" ? "♧" : wish.kind === "boss" ? "⚔" : "✦"}</span><span><strong>{wish.name}</strong><small>{wish.description}</small></span>
      </button>)}</div>
      <p className="wf-small">Choose one wish. The relics scatter to new hiding places afterward, and the altar offers new wishes.</p>
    </div>
  </section>;
}
