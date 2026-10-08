// The simulation owns local targets and prompt timing; every control resolves
// against the same prompt, including the glyph captured when a press began.
export type InteractKind = "talk" | "use" | "taxi" | "next";
export interface InteractTarget {
  id: string; name: string; kind: InteractKind; x: number; y: number; locked?: boolean;
}
export interface InteractionCandidate extends InteractTarget { distance: number; radius: number }
export interface AttackPresentation { action: "attack" | "interact"; targetId?: string }
export interface ActionPrompt extends AttackPresentation {
  glyph: "attack" | InteractKind; label: string; target: InteractTarget | null;
}
export interface ContextAttackState {
  target: InteractTarget | null; displayed: ActionPrompt; previous: ActionPrompt;
  candidate: ActionPrompt; candidateSince: number; swappedAt: number;
}
export const CONTEXT_STABLE_SECONDS = .12;
export const CONTEXT_PRESS_GRACE_SECONDS = .15;
export const attackPrompt = (): ActionPrompt => ({ action: "attack", glyph: "attack", label: "Attack", target: null });
export function newContextAttack(): ContextAttackState {
  const prompt = attackPrompt();
  return { target: null, displayed: prompt, previous: prompt, candidate: prompt, candidateSince: 0, swappedAt: -Infinity };
}
export function selectInteractionTarget(candidates: InteractionCandidate[], x: number, y: number, faceX: number, faceY: number): InteractTarget | null {
  const eligible = candidates.filter(target => target.distance < target.radius);
  // Prefer the forward half-plane, then distance. IDs settle exact ties so map
  // authoring order never changes the control's meaning.
  const facing = (target: InteractTarget) => (target.x - x) * faceX + (target.y - y) * faceY >= 0;
  eligible.sort((a, b) => Number(facing(b)) - Number(facing(a)) || a.distance - b.distance || a.id.localeCompare(b.id));
  const selected = eligible[0];
  if (!selected) return null;
  return { id: selected.id, name: selected.name, kind: selected.kind, x: selected.x, y: selected.y, locked: selected.locked };
}
export function interactionPrompt(target: InteractTarget | null, hostileInReach: boolean, nonCombat: boolean): ActionPrompt {
  return target && (nonCombat || !hostileInReach)
    ? { action: "interact", glyph: target.kind, label: target.name, targetId: target.id, target }
    : attackPrompt();
}
const promptKey = (prompt: AttackPresentation) => `${prompt.action}:${prompt.targetId ?? ""}`;
export function updateContextPrompt(context: ContextAttackState, desired: ActionPrompt, time: number): void {
  if (promptKey(desired) !== promptKey(context.candidate)) { context.candidate = desired; context.candidateSince = time; }
  else context.candidate = desired;
  if (promptKey(desired) === promptKey(context.displayed)) { context.displayed = desired; return; }
  if (time - context.candidateSince + 1e-9 < CONTEXT_STABLE_SECONDS) return;
  context.previous = context.displayed; context.displayed = desired; context.swappedAt = time;
}
export function resolveContextPress(context: ContextAttackState, hostileInReach: boolean, nonCombat: boolean, time: number, shown?: AttackPresentation): "attack" | "interact" | "none" {
  if (hostileInReach && !nonCombat) return "attack";
  let prompt = context.displayed;
  if (shown && promptKey(shown) === promptKey(context.displayed)) prompt = context.displayed;
  else if (shown && time - context.swappedAt <= CONTEXT_PRESS_GRACE_SECONDS && promptKey(shown) === promptKey(context.previous)) prompt = context.previous;
  if (prompt.action === "attack") return "attack";
  // If a target moved out of reach, preserve the shown talk/open intention
  // without turning the press into an unexpected sword swing.
  return context.target?.id === prompt.targetId ? "interact" : "none";
}
