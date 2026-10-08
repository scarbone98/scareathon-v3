import type { CSSProperties } from "react";
import type { GameState } from "../game/sim";
import { CHIPS, CHIP_REGISTRY, itemsState, unlockedChipSlots, type ChipId } from "../game/u1/items/chips";
import "./chips.css";

interface Props {
  state: GameState;
  onEquip: (id: ChipId | null, slot: number) => void;
}

export function ChipsPanel({ state, onEquip }: Props) {
  const chips = itemsState(state).chips;
  const slots = unlockedChipSlots(state.character.level);
  return <section className="wf-chip-panel" aria-labelledby="wf-chips-title">
    <div className="wf-items-heading"><div><p className="wf-eyebrow">PASSIVE LOADOUT</p><h3 id="wf-chips-title">Wayside chips</h3></div><span className="wf-items-count">{chips.owned.length} / {CHIPS.length}</span></div>
    <p className="wf-small">Equip up to three chips. Their effects travel with every hero in your crew.</p>
    <div className="wf-chip-slots">
      {[0, 1, 2].map(slot => {
        const id = chips.equipped[slot], chip = id ? CHIP_REGISTRY[id] : null, locked = slot >= slots;
        return <div className={`wf-chip-slot ${locked ? "is-locked" : ""}`} key={slot}>
          <span className="wf-chip-slot-glyph" aria-hidden="true" style={chip ? { "--wf-chip-color": chip.color } as CSSProperties : undefined}>{locked ? "◇" : chip?.glyph ?? "+"}</span>
          <label htmlFor={`wf-chip-slot-${slot}`}>Slot {slot + 1}<small>{locked ? `Unlocks at level ${slot === 1 ? 3 : 6}` : chip ? "Equipped" : "Ready for a chip"}</small></label>
          <select id={`wf-chip-slot-${slot}`} aria-label={`Chip slot ${slot + 1}${locked ? `, unlocks at level ${slot === 1 ? 3 : 6}` : ""}`} disabled={locked} value={locked ? "" : id ?? ""} onChange={event => onEquip(event.target.value ? event.target.value as ChipId : null, slot)}>
            <option value="">{locked ? "Locked" : "Empty slot"}</option>
            {CHIPS.filter(candidate => chips.owned.includes(candidate.id)).map(candidate => <option key={candidate.id} value={candidate.id} disabled={chips.equipped.slice(0, slots).some((equipped, index) => index !== slot && equipped === candidate.id)}>{candidate.name}</option>)}
          </select>
          <button className="wf-secondary wf-chip-remove" disabled={locked || !chip} aria-label={chip && !locked ? `Remove ${chip.name} from slot ${slot + 1}` : `Slot ${slot + 1} has no equipped chip`} onClick={() => onEquip(null, slot)}>Remove</button>
        </div>;
      })}
    </div>
    <div className="wf-chip-library" aria-label="Chip collection">
      {CHIPS.map(chip => {
        const owned = chips.owned.includes(chip.id), equipped = chips.equipped.slice(0, slots).includes(chip.id);
        return <article className={`wf-chip-card ${owned ? "is-owned" : ""} ${equipped ? "is-equipped" : ""}`} key={chip.id} style={{ "--wf-chip-color": chip.color } as CSSProperties}>
          <details open={owned}><summary><span className="wf-chip-glyph" aria-hidden="true">{chip.glyph}</span><span><strong>{chip.name}</strong><small>{equipped ? "Equipped" : owned ? "Owned" : "Not found"}</small></span><span className="wf-chip-expand" aria-hidden="true">⌄</span></summary>
            <p>{chip.description}</p><p className="wf-small">{chip.sourceHint}</p>
          </details>
          {owned && <div className="wf-chip-actions"><span>Equip slot</span>{[0, 1, 2].map(slot => <button className="wf-secondary" key={slot} disabled={slot >= slots || equipped} aria-pressed={slot < slots && chips.equipped[slot] === chip.id} aria-label={`Equip ${chip.name} in slot ${slot + 1}${slot >= slots ? `, unlocks at level ${slot === 1 ? 3 : 6}` : ""}`} onClick={() => onEquip(chip.id, slot)}>{slot + 1}</button>)}</div>}
        </article>;
      })}
    </div>
  </section>;
}
