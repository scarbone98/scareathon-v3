# Mystery Crypt: sprites wanted

Most of Mystery Crypt's art comes from 8 Bit Evil and 8 Bit Evil Returns. The
sprites below didn't exist, so the game uses **stubs**: a first pass drawn by
code (`scripts/mystery-crypt-art.mjs`). Each one is meant to be replaced by
real art.

`preview.png` in this folder shows every stub at 3x.

## How to replace a stub

1. Draw it at **exactly** the size and frame layout listed below: frames side
   by side, left to right, in one PNG with a transparent background.
2. Save it over the file in `public/mystery-crypt/` (same name).
3. Delete its line from `mystery-crypt-art/stubs.json`, so re-running the stub
   generator (`npm run art:mystery-crypt`) never overwrites your file.

No code changes are needed. If a sprite really needs a different size, say so,
because the game has to know the new size.

Match the existing sprites: chunky pixels, a 1px dark outline (`#140a1c`),
and no anti-aliasing. The heroes are 16x24 (in `public/royale/`), which sets the
scale for everything in the dungeon.

## Dialogue portraits

`public/mystery-crypt/portraits/<who>.png`: **240x48**, five **48x48**
frames, in this order:

| Frame | Face | Used when |
|---|---|---|
| 1 | normal | most lines |
| 2 | happy | jokes, relief, excitement |
| 3 | shock | surprises, "!" moments |
| 4 | sad | worried, hurt, tired |
| 5 | angry | arguing, bosses |

Show the head and shoulders facing slightly toward the viewer, with a
transparent background (the dialogue box draws a dark frame behind it).

| File | Who | Notes |
|---|---|---|
| `alex.png` | Alex Day | The lead. Last year's Scareathon champion. Long golden hair, orange top. Brave, a little smug about the trophy. |
| `joe.png` | Joe | Sandy hair with a cowlick, green striped shirt. The sensible one. |
| `matt.png` | Matt | Dark slate hair, red jacket over a white shirt. Dramatic; knows his good side. |
| `jon.png` | Jon | Spiky dark hair, big glasses, blue jacket. Notices things nobody else does. |
| `wick.png` | Wick | Your partner: a small candle monster with a face. Nervous, sweet, braver than it looks. |
| `snail.png` | The Snail King | Grumpy elder of the camp (the snail from 8 Bit Evil Returns). The stub is just his sprite. |
| `merchant.png` | The Merchant | Cloak, top hat and big eyes (8 Bit Evil Returns). Only talks about candy. |
| `owl.png` | The Owl | Lives in the tree at camp and hears everything. The stub is a zoomed crop of the tree sprite. |
| `ratking.png` | The Rat King | Chapter 1's boss. A big rat with a crown who thinks everything that falls down is his. |

## Wick

`public/mystery-crypt/wick.png`: **64x24**, four **16x24** frames. This is
the idle animation (the flame flickers), played at about 7fps. In the dungeon
Wick hops when walking, like the other monsters, and should face right.

## Bosses

`public/mystery-crypt/bosses/<monster>.png`: each stage's boss is its
monster with a crown (the stub literally pastes a crown on the normal
frames). Each file is the normal sprite's frame size **plus 6px taller**,
with the same frame count. The game draws bosses 1.6x bigger than normal.

| File | Frames | Boss |
|---|---|---|
| `rat.png` | 6 × 16x22 | Rat King (Graveyard Gate) |
| `pumpkin.png` | 6 × 16x22 | Jack the Gourd (Pumpkin Cellar) |
| `zombie.png` | 6 × 16x30 | Zombie Lord (Zombie Tunnels) |
| `candle.png` | 6 × 32x38 | Grand Candle (Candlelit Chapel) |
| `scarecrow.png` | 6 × 24x54 | The Stalk (Haunted Harvest) |
| `werewolf.png` | 7 × 30x32 | Alpha (Wolf Den) |
| `ufo.png` | 6 × 32x32 | Mothership (Crash Site) |
| `shadowbeast.png` | 6 × 32x38 | The Umbra (Shadow Vault) |
| `swampthing.png` | 6 × 34x64 | Bog King (Swamp of Sorrow) |

## Coming later

These don't have stubs yet because their chapters aren't written. Draw them
whenever you like:

- **Portraits** for the other bosses (`jackthegourd`, `zombielord`,
  `grandcandle`, `thestalk`, `alpha`, `mothership`, `umbra`, `bogking`) and
  for the Warden, the thing the trophy keeps sealed. Same 240x48 format.
- **The Warden** itself, the final boss: big (around 48x64), several frames.
  8 Bit Evil Returns' tentacle sprite (`public/mystery-crypt/tentacle.png`) is
  a good starting point.
- **Heroes facing up and down.** Right now they only face sideways.
