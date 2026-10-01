// The cartridge train into the arcade: on the walk up to the cabinet the cartridges come out
// of the rack one behind another, all along the same gentle arc into the row (the one going
// furthest leading, each landing with a little bounce), and walking away
// they go home along it again, last in first out. Shared by the station (which flies them)
// and its page (which waits for them to land before the arcade takes over).
export const ROW_DELAY = 0; // before the first leaves the rack (straight away)
export const ROW_FLY = 1.2; // each one's trip along the path
export const ROW_STAGGER = 0.08; // between one and the next (their spacing in the train)
export const ROW_PICK = 0.12; // the picked one tipping forward at the end
export const ROW_CARTS = 9; // how many ride: the picked one and up to four either side

export const ROW_HANDOFF_EARLY = 0.5; // the arcade fades in over the last cartridges landing

// When the arcade takes over, in ms: as the last cartridges land (the arcade's own row is
// already in the same places, so it can fade in over the end of the trip)
export const ROW_DONE_MS = Math.round((ROW_DELAY + (ROW_CARTS - 1) * ROW_STAGGER + ROW_FLY + ROW_PICK - ROW_HANDOFF_EARLY) * 1000);
