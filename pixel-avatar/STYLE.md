# Pixel avatar guide

Avatars are 8-bit sprites in the style of **8 Bit Evil Returns**: the four kids
(Alex, Joe, Jon, Matt) were rebuilt from their idle sprites as a shared body
plus swappable hair and clothes. They're only examples: every player starts as
a random kid rolled from the free items (`randomLook` in
`src/components/avatar/look.ts`) and makes it their own. Other bodies (the ghost, the
zombie, the flying skull) come straight from the game's sprites.

```
npm run art:avatar             # validate, export, render previews
npm run art:avatar -- --check  # validate only
```

The build writes `public/avatar-px/` (each part's frames as a PNG strip, an
icon per item, `manifest.json`), `server/utils/avatarRules.json` (what the API
accepts) and `server/db/avatar_catalog.sql` (run it on the database after
changing items). Previews go to `pixel-avatar/previews/` (not committed):
one animated strip per outfit, and `_sheet.png` with every icon.
**Look at them** after every change.

## The canvas and the kid

One frame is **32 x 48**. The kid is the reference every part is drawn on: its
16x24 sprite sits with its top-left at **(8, 24)**, leaving headroom for hats
and room at the sides for wings, held things and pets.

| Kid landmark | Canvas (x, y) |
| --- | --- |
| Hair top | y 24-25 |
| Skull | top row y 26 (x 13-18), widest x 11-19 |
| Eyes | x 15 and x 18, y 29-31 (1 px wide, 3 tall) |
| Neck | x 14-16, y 33 |
| Torso | x 12-18, y 34-38 |
| Hand (the near arm hangs at the left) | x 13, y 37-39 |
| Waist | y 39-40 |
| Legs | x 13 and x 17, y 41-43 |
| Feet | y 44-46 (the left foot points left) |
| Shadow | x 11-19, y 44-47 |

## Bodies, rigs and anchors

A body is an item in category `body` with a `rig`: its idle loop's frame
count, speed, and per frame where each **anchor** sits relative to the kid.
Every other part hangs on an anchor:

- `head`: hair, hats, glasses, masks
- `body`: tops, jackets, capes, wings, held things (the default)
- `ground`: legs, shoes, the shadow (never bobs)
- `free`: backgrounds and pets that move on their own frames

The kid bobs 1 px down on frames 2-3 (`head` and `body` anchors), exactly like
the game sprites, while its legs stay put. The ghost's head floats about 10 px
higher than the kid's, so a hat drawn on the kid lands on the ghost too. A body
without an anchor simply doesn't draw parts that hang there (the zombie has no
`body` anchor, so shirts don't show on it).

Parts that only make sense on some bodies (hair is shaped for the kid's skull)
list them in `"fits": ["body_kid"]`. The wardrobe and shop say "Doesn't show on
your Ghost" for items that don't fit the body being worn.

## Items

`pixel-avatar/items/<item_key>/item.json` plus its part files:

```json
{
  "name": "Pointy Witch Hat",
  "category": "head",
  "rarity": "rare",
  "price": 200,
  "release": "released",
  "fits": ["body_kid"],
  "hides": ["hair"],
  "dyes": { "dye1": "plum" },
  "parts": [{ "slot": "head", "file": "hat.txt", "anchor": "head" }]
}
```

- `starter: true` items are free and given to everyone (`price: null`), and
  random kids are made from them; `default: true` ones are worn until the
  site rolls a player's first random look.
- `category` decides what can be worn together (see `CATEGORIES` in
  `scripts/pixel-avatar/lib.mjs`); `slot` decides draw order (`SLOTS`).
- `hides` lists slots the item covers (the bedsheet ghost hides hair).
- Item keys must not reuse an older avatar's key (the catalog SQL refuses).

### Text parts

```
# comment
at: 13,26          canvas position of the grid on the kid, frame 0
legend:
  a = skin.3       ramp.shade; 0 is darkest, 3 lightest
  e = eyes.1
  m = dye1.2
--- 0
.aaa.
aeaea
--- 4              optional: frame 4 differs (swaying hair, a flicker)
...
```

Frames without a grid repeat frame 0. Rows may leave off trailing dots.

### Colours

`palette.json` holds 4-shade ramps. Five channels recolour per player:
`skin`, `hair` and `eyes` (from the profile) and `dye1`/`dye2` (per item).
Draw them as `skin.N`, `hair.N` and so on: they render in the channel's
default ramp (the kids' own colours) and the browser swaps those exact RGB
values for the player's choice, so no other ramp may reuse a default's colours.
Everything else (`ink`, `bone`, `pumpkin`, `flame`...) is fixed.

Match the kids: no black outlines on clothes (shade 0 or 1 edges instead),
light from the upper left, flat 1 px legs, and a soft `shadow.1` under bodies.

### PNG parts

Painted sprites (the ghost is translucent) are used as they are: a strip of
frames side by side.

```json
{ "slot": "body", "png": "ghost.png", "frameWidth": 16, "at": [8, 16], "anchor": "ground" }
```

## Outfits

`outfits/*.json` are preview-only looks: the four kids, and shop items shown
off on different bodies. Add one for every new item.
