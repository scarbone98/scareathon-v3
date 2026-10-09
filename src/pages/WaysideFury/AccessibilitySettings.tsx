import type { SaveSettings } from './game/save';
import { DEFAULT_UX, DEFAULT_KEYS } from './game/ux';
export function AccessibilitySettings({ settings, onChange, inCoop }: { settings: SaveSettings; onChange: (settings: SaveSettings) => void; inCoop: boolean }) {
  const ux = { ...DEFAULT_UX, ...settings.ux };
  const update = (patch: Partial<typeof ux>) => onChange({ ...settings, ux: { ...ux, ...patch } });
  return <section className="wf-accessibility" aria-label="Accessibility and controls">
    <h3>HUD & accessibility</h3>
    <label>HUD size <output>{Math.round(ux.hudSize * 100)}%</output><input data-ux="hudSize" aria-label="HUD size" type="range" min="0.8" max="1.3" step="0.05" value={ux.hudSize} onChange={e => update({ hudSize: +e.target.value })} /></label>
    <label><input type="checkbox" checked={ux.minimalHud} onChange={e => update({ minimalHud: e.target.checked, ...(e.target.checked ? { hudSize: .8 } : {}) })} /> Minimal HUD</label>
    <label>Text size <output>{Math.round(ux.textSize * 100)}%</output><input data-ux="textSize" aria-label="Text size" type="range" min="1" max="1.5" step="0.1" value={ux.textSize} onChange={e => update({ textSize: +e.target.value })} /></label>
    <label><input type="checkbox" checked={ux.highContrast} onChange={e => update({ highContrast: e.target.checked })} /> High contrast dialogs</label>
    <label><input type="checkbox" checked={ux.shapeMarkers} onChange={e => update({ shapeMarkers: e.target.checked })} /> Shape markers</label>
    <label><input type="checkbox" checked={ux.haptics} onChange={e => update({ haptics: e.target.checked })} /> Haptics</label>
    <h3>Assist mode</h3><p>Extra HP adds a damage buffer without changing your crew’s saved combat stats.</p>
    <label>Game speed <output>{Math.round(ux.gameSpeed * 100)}%</output><input data-ux="gameSpeed" aria-label="Game speed" disabled={inCoop} type="range" min="0.5" max="1" step="0.1" value={ux.gameSpeed} onChange={e => update({ gameSpeed: +e.target.value })} /></label>
    <label>Extra HP <output>+{ux.extraHp}%</output><input data-ux="extraHp" aria-label="Extra HP" disabled={inCoop} type="range" min="0" max="100" step="25" value={ux.extraHp} onChange={e => update({ extraHp: +e.target.value })} /></label>
    {inCoop && <p>Assist settings apply in solo play.</p>}
    <details><summary>Keyboard bindings</summary><p>Select a binding and press a key. Escape cancels. Duplicate keys exchange actions.</p>
      {Object.entries(DEFAULT_KEYS).map(([action, fallback]) => <label key={action}>{action}<input aria-label={`Key for ${action}`} value={ux.keys[action] ?? fallback} readOnly onKeyDown={e => {
        e.preventDefault(); e.stopPropagation(); const key = e.key.toLowerCase();
        if (key === 'escape') { e.currentTarget.blur(); return; }
        if (!/^(?:[a-z0-9]|arrow(?:up|down|left|right)|shift|enter| )$/.test(key)) return;
        const keys = { ...DEFAULT_KEYS, ...ux.keys }; const previous = keys[action];
        const duplicate = Object.keys(keys).find(other => other !== action && keys[other] === key);
        if (duplicate) keys[duplicate] = previous;
        keys[action] = key; update({ keys });
      }} /></label>)}
      <button className="wf-secondary" onClick={() => update({ keys: {} })}>Reset keys</button>
    </details>
  </section>;
}
