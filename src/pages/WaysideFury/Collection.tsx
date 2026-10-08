import { HIDDEN_PICKUPS } from "./game/collectibles";
import type { GameState } from "./game/sim";
import "./Collection.css";
const AREAS = [{ id: "overworld", name: "Wayside County" }, { id: "wayside", name: "Wayside Town" },
  { id: "blast", name: "Blast Site" }, { id: "eightbit-realm", name: "8-Bit Realm" }];
const ICONS = { snack: "▰", candy: "◆", trinket: "✦", lore: "▤" };
export function Collection({ state, onBack }: { state: GameState; onBack: () => void }) {
  const found = new Set(state.foundItems);
  const chapters = [...new Set(HIDDEN_PICKUPS.map(item => item.chapter))].filter(chapter => chapter <= state.chapter);
  const shown = HIDDEN_PICKUPS.filter(item => chapters.includes(item.chapter));
  const count = shown.filter(item => found.has(item.id)).length;
  return <div className="wf-overlay wf-character wf-collection" role="dialog" aria-label="Collection">
    <div className="wf-character-content"><header><div className="wf-collection-heading"><div><p className="wf-eyebrow">SIDE FINDS & STORIES</p><h2>Collection</h2></div><button className="wf-secondary" onClick={onBack}>Back</button></div>
      <p>{count} / {shown.length} found</p><progress aria-label="Collection progress" value={count} max={shown.length || 1} /><p className="wf-small">Explore corners and watch for a quiet glint. Trinkets equip themselves; matching buffs do not stack.</p></header>
      {chapters.map(chapter => <section key={chapter} aria-label={`Chapter ${chapter} collection`}><h3>Chapter {chapter}</h3>
        {AREAS.map(area => { const items = HIDDEN_PICKUPS.filter(item => item.chapter === chapter && item.area === area.id);
          if (!items.length) return null;
          return <section key={area.id} aria-label={`${area.name} collection`}><h4>{area.name} <small>{items.filter(item => found.has(item.id)).length} / {items.length}</small></h4>
            <div className="wf-collection-grid">{items.map(item => { const known = found.has(item.id);
              return <article className={`wf-collection-item ${known ? "wf-found" : "wf-unfound"}`} key={item.id} aria-label={known ? item.name : "Undiscovered item"}>
                <span className="wf-collection-icon" aria-hidden="true">{known ? ICONS[item.kind] : "?"}</span><div><strong>{known ? item.name : "Unknown find"}</strong>
                {known && <p>{item.description}</p>}{!known && <p>A story still waiting to be found.</p>}</div></article>;
            })}</div></section>;
        })}</section>)}
      <button className="wf-character-back" onClick={onBack}>Back to pause</button></div>
  </div>;
}
