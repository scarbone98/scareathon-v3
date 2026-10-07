// When the capsule machine's crank was last turned (performance.now()), so the machine in
// the scene can turn its crank and rattle while the card under it waits on the capsule.
// (a plain value both sides read: the scene is its own chunk, and this keeps it that way)
export const capsuleSignal = { turnedAt: -Infinity };

// How long a turn of the crank takes (ms): the card holds the capsule back this long
export const CAPSULE_TURN_MS = 1400;
