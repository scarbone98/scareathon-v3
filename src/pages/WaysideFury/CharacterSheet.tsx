import { ChipsPanel } from "./u1/ChipsPanel";
import { RelicsPanel } from "./u1/RelicsPanel";
import type { ChipId } from "./game/u1/items/chips";
import type { HeroAvatar } from "./game/avatar";
import { HERO_IDS, HERO_NAMES, xpForLevel, type GameState, type HeroId } from "./game/sim";
import type { SaveSettings } from "./game/save";
import type { InputMode } from "./game/input";
import { HeroPortrait } from "./HeroPortrait";
interface Props {
  state: GameState; avatar: HeroAvatar | null; settings: SaveSettings; mode: InputMode;
  onEquipChip: (id: ChipId | null, slot: number) => void; onWish: (id: string) => void;
  onSettings: (settings: SaveSettings) => void; onParty: (id: HeroId) => void; onBack: () => void;
}
export function CharacterSheet({ state, avatar, settings, mode, onEquipChip, onWish, onSettings, onParty, onBack }: Props) {
  const { level, xp } = state.character;
  const areas = [{ id: "wayside", name: "Wayside Station" }, { id: "blast", name: "Blast Site" }, { id: "eightbit-realm", name: "8-Bit Realm" }];
  const volume = (kind: "musicVolume" | "sfxVolume", value: number) => onSettings({ ...settings, [kind]: value });
  return <div className="wf-overlay wf-character" aria-label="Character sheet">
    <div className="wf-character-content">
      <header className="wf-character-heading"><HeroPortrait id="you" avatar={avatar} /><div><p className="wf-eyebrow">YOUR CHARACTER</p><h2>You <small>LV {level}</small></h2><p>{xp} / {xpForLevel(level)} XP · ◈ {state.candy} candy</p>
        <progress aria-label="Experience toward next level" max={xpForLevel(level)} value={xp} /></div></header>
      <ChipsPanel state={state} onEquip={onEquipChip} />
      <RelicsPanel state={state} onWish={onWish} />
      <div className="wf-character-grid">
        <section aria-label="Gear"><h3>Gear</h3><div className="wf-gear-slot"><span>✦</span><div><strong>Power charm</strong><p>{state.gear.power ? `+${state.gear.power} Power` : "Empty slot"}</p></div></div>
          <div className="wf-gear-slot"><span>◇</span><div><strong>Ward charm</strong><p>{state.gear.ward ? `+${state.gear.ward} Defense` : "Empty slot"}</p></div></div><p className="wf-small">Gear strengthens every hero. Your outfit is cosmetic.</p></section>
        <section aria-label="Area progress"><h3>Journey · Chapter {state.chapter}</h3>{areas.map(area => <p className="wf-area-progress" key={area.id}><span>{area.name}</span><strong>{state.areas.includes(area.id) ? "Cleared" : "Ahead"}</strong></p>)}
          <p className="wf-small">{state.clearedRooms.filter(id => /^blast-[0-9]+$/.test(id)).length} / 10 Blast Site zones · {state.bosses.length} guardians defeated</p></section>
        <section className="wf-character-crew" aria-label="Unlocked heroes"><h3>Crew · {state.unlockedHeroes.length} unlocked</h3><p className="wf-small">Choose one or two heroes. Bench a hero before adding another.</p><div className="wf-party">{HERO_IDS.map(id => <button key={id} className={`wf-secondary ${state.party.includes(id) ? "wf-in-party" : ""}`} disabled={!state.unlockedHeroes.includes(id)} aria-pressed={state.party.includes(id)} onClick={() => onParty(id)}><HeroPortrait id={id} avatar={avatar} /><span>{HERO_NAMES[id]}<small>{state.party.includes(id) ? "In party" : "Benched"} · {Math.ceil(state.heroes[id].hp)} HP</small></span></button>)}</div><p className="wf-small" role="status">{state.notice}</p></section>
        <section className="wf-character-settings" aria-label="Settings"><h3>Settings</h3>
          <label htmlFor="wf-music-volume">Music <output>{Math.round(settings.musicVolume * 100)}%</output></label><input id="wf-music-volume" aria-label="Music volume" type="range" min="0" max="1" step="0.05" value={settings.musicVolume} onChange={event => volume("musicVolume", Number(event.target.value))} />
          <label htmlFor="wf-sfx-volume">Sound effects <output>{Math.round(settings.sfxVolume * 100)}%</output></label><input id="wf-sfx-volume" aria-label="Sound effects volume" type="range" min="0" max="1" step="0.05" value={settings.sfxVolume} onChange={event => volume("sfxVolume", Number(event.target.value))} />
          <label htmlFor="wf-stick-sensitivity">Touch stick sensitivity <output>{settings.controls.stickSensitivity.toFixed(2)}×</output></label><input id="wf-stick-sensitivity" aria-label="Touch stick sensitivity" type="range" min="0.5" max="2" step="0.05" value={settings.controls.stickSensitivity} onChange={event => onSettings({ ...settings, controls: { ...settings.controls, stickSensitivity: Number(event.target.value) } })} />
          <button className="wf-secondary" aria-pressed={!settings.controls.tutorialDismissed} onClick={() => onSettings({ ...settings, controls: { ...settings.controls, tutorialDismissed: !settings.controls.tutorialDismissed } })}>{settings.controls.tutorialDismissed ? "Show control hints" : "Hide control hints"}</button>
          <p className="wf-small">{mode === "gamepad" ? "D-pad up/down selects. Left/right adjusts a slider. A confirms." : "Use Tab to select and arrow keys to adjust. Touch sliders to change."}</p></section>
      </div>
      <button className="wf-character-back" onClick={onBack}>Back to pause</button>
    </div>
  </div>;
}
