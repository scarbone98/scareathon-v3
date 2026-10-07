// The capsule machine's turn, shared by the machine in the scene (which is wound by hand and
// plays it out) and its counter over the scene (things/Capsule.tsx, which pays and asks the
// server what was in the capsule). A plain object both sides read each frame: the scene is
// its own chunk, and this keeps it that way.
//
// idle: waiting to be wound. paying: tickets go in the slot. shaking: the capsules rattle
// (for as long as the server takes). beat: it stops. out: a capsule pops out of the chute
// and comes up to you. revealed: it's open on the page; the machine waits.
export type CapsulePhase = "idle" | "paying" | "shaking" | "beat" | "out" | "revealed";

export const capsuleMachine = {
  phase: "idle" as CapsulePhase,
  since: 0, // performance.now() when the phase began
  lid: "#8a2f2a", // the colour of the capsule that comes out: its rarity's
  // Called by the scene when the crank has been wound right round
  onCranked: null as null | (() => void),
  set(phase: CapsulePhase, lid?: string) {
    this.phase = phase;
    this.since = performance.now();
    if (lid) this.lid = lid;
  },
};

// How long each step takes (ms)
export const CAPSULE_MS = { pay: 950, shake: 1100, beat: 450, out: 950 };
// How many tickets are seen going in (the price is taken in one go)
export const CAPSULE_TICKETS = 5;
