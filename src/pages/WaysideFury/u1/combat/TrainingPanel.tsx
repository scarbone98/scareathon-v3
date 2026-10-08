import { HERO_NAMES, type GameState } from "../../game/sim";
import { TRAINING_TIER_NAMES } from "../../game/u1/combat/training";
import { signatureDefinition } from "../../game/u1/combat/signature";
import "./training.css";
const NAMES = ["time trial", "target break", "combo drill"];
const DESCRIPTIONS = [
  "Run through five gold rings in order. Use Dash to save time.",
  "Break four practice targets with Attack or Ki before 18 seconds pass.",
  "Land nine melee hits in a row, 0.18–0.72 seconds apart. A miss resets your chain.",
];
const UPGRADES = ["Faster signature flight and more impact.", "A wider volley with greater coverage.", "Longer piercing travel, Ki recovery, and stamina recovery."];
export function TrainingPanel({ state, start, leave }: { state: GameState; start: () => void; leave: () => void }) {
  const tier = state.u1.combat.training[state.active], signature = signatureDefinition(state), mastered = tier === 3;
  return <section className="wf-overlay wf-place-panel wf-training-panel" aria-label="Training grounds">
    <p className="wf-eyebrow">WAYSIDE TRAINING GROUNDS</p><h2>{HERO_NAMES[state.active]} · {mastered ? "Signature mastered" : `Tier ${tier + 1}: ${TRAINING_TIER_NAMES[tier + 1]}`}</h2>
    <p>{signature.name} · {tier}/3 upgrades</p>
    <ol className="wf-training-tiers">{UPGRADES.map((upgrade, i) => <li key={upgrade} className={tier > i ? "wf-tier-earned" : ""}><span>{tier > i ? "✓" : i + 1}</span><div><strong>{TRAINING_TIER_NAMES[i + 1]}</strong><small>{upgrade}</small></div></li>)}</ol>
    <p>{mastered ? "Choose another hero in the character sheet to train their signature." : DESCRIPTIONS[tier]}</p>
    {!mastered && <button disabled={state.heroes[state.active].hp <= 0} onClick={start}>Start {NAMES[tier]}</button>}
    <p className="wf-small">Practice progress belongs to your hero. Earned tiers are permanent.</p>
    <button className="wf-secondary" onClick={leave}>Leave training board</button>
  </section>;
}
export function TrainingHud({ state, cancel }: { state: GameState; cancel: () => void }) {
  const t = state.training;
  if (!t) return null;
  const progress = t.kind === "time-trial" ? t.ringIndex : t.kind === "target-break" ? t.targets.filter(target => target.broken).length : t.hits;
  const total = t.kind === "time-trial" ? t.rings.length : t.requiredHits;
  return <section className="wf-training-hud" aria-label="Training challenge">
    <div><strong>{HERO_NAMES[t.hero]} · {TRAINING_TIER_NAMES[t.tier]}</strong><span>{Math.max(0, t.timeLimit - t.elapsed).toFixed(1)}s · {progress}/{total}</span></div>
    <progress value={progress} max={total} aria-label="Training progress" /><button className="wf-secondary" onClick={cancel}>Stop training</button>
  </section>;
}
export function SignatureTier({ state, hero }: { state: GameState; hero: GameState["active"] }) {
  const tier = state.u1.combat.training[hero];
  return <small className="wf-signature-tier">Signature · {tier}/3 · {TRAINING_TIER_NAMES[tier]}</small>;
}
