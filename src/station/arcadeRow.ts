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

// When the last has landed and the picked one tipped up: the arcade takes over then, in ms
export const ROW_DONE_MS = Math.round((ROW_DELAY + (ROW_CARTS - 1) * ROW_STAGGER + ROW_FLY + ROW_PICK) * 1000);
