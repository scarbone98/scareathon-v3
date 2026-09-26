# Avatar art guide

Avatar art is drawn as text. Every item is a folder of pixel grids in
`avatar-art/items/<item_key>/`, built into PNGs by:

```
npm run art:resculpt          # regenerate every sculpted part (or: -- <item> ...)
npm run art:avatar            # validate, export, render previews
npm run art:avatar -- --check # validate only
```

The build writes `public/avatar-v2/items/<item>/<slot>.png` (one PNG per slot the
item uses, full 120x150 canvas, canonical colours; `<slot>.<build>.png` when the
slot is fitted per body build), `public/avatar-v2/manifest.json`,
and renders every outfit in `avatar-art/outfits/` to `avatar-art/previews/`
(4x, plus `_sheet.png` with all outfits side by side).

## How to work

1. Rough out the shape with a **sculpt** (next section), or draw small things
   (eyes, mouths, flames, cracks) straight into a `.txt` grid.
2. Run the build. It refuses anything off-palette, off-canvas or malformed.
3. **Look at the preview PNGs** (open them with the image viewer / Read tool). Judge them
   honestly at 4x *and* think about how they read at 1x. Fix, rebuild, repeat.
4. Add or update an outfit in `avatar-art/outfits/` that shows the item, with at
   least one alternative skin tone and dye so recolouring gets checked too,
   on both builds if it is fitted per build (`"build": "f"` or `"m"`).

Reference: the look and proportions come from Gaia Online avatars. Study real
samples (see how to fetch them in the project memory), but never copy their pixels.

## Sculpting

Anything with volume (bodies, hair, hats, horns, clothing) starts as a sculpt
in `avatar-art/sculpts/*.mjs`: rough 3D shapes (`ellipsoid`, `sphere`, tapered
`capsule`) that `scripts/avatar-art/sculpt.mjs` lights from one fixed light
and snaps to palette shades. This is what keeps every item lit and shaded the same way.

A part in `item.json` names the sculpt it comes from, and `npm run art:resculpt`
regenerates it (once per build for fitted parts):

```json
{ "slot": "torso", "file": "sweater.m.txt", "build": "m", "sculpt": "clothing.mjs#sweater" }
```

A sculpt file exports `parts`, either an object or a function `parts(build)`
returning `{ partName: { shapes, blend, comment, ... } }`.

- Coordinates are canvas pixels, with z pointing toward the viewer. The shared
  head's cranium is centred at (63, 49, 0) with radius ~17.5; `sculpts/body.mjs`
  has every other body part, per build.
- Shapes in the same `group` melt together (`blend` px). Different groups
  overlap hard and get a dark contact line, which is how strands of hair,
  arms over torsos and folds read.
- `material` can be a function of (x, y, z) returning a ramp, `{ ramp, shift }`
  (push the shade for ribbing, stripes, folds) or null (cut the pixel);
  `clip` also removes pixels (face openings, scalloped edges).
- Keep limbs clear of the torso where they hang: an arm tucked just behind the
  torso's edge gets a jagged dark overlap line down its inside.
- **Never hand-edit a sculpted `.txt`**; re-sculpting would wipe it. Put
  hand-drawn detail (cracks, prints, clasps, stitches) in its own part in the
  same slot, listed after the sculpted one. See `porcelain_mask` and `grave_tee`.

## Clothing

There are two body builds, `f` and `m`, like Gaia's two bases. They share the
head (so hair, faces and hats fit both) but differ from the neck down: `m` has
broad shoulders, a thick neck and a straight waist; `f` has narrower shoulders,
a waist and hips.

Garments are sculpted from the body's own shapes: `bodyFor(build)` in
`avatar-art/sculpts/body.mjs` gives `torso`, `chest`, `waist`, `hips`, `neck`,
`upperArm`, `forearm`, `hand`, `thigh`, `shin` and `foot` (sides `"far"` and
`"near"`), grown with `inflate` so they sit on top. Write the garment once as
`parts(build)` and list one part per build in `item.json`; it fits both bodies
and refits if a body changes. See `sculpts/clothing.mjs`.

- **How much to inflate:** fitted tops and stockings 0.5-1, sweaters and
  trousers 1.5-2.2, shoes 1.3-1.6, anything bulky (coats, armour) 2.5+.
- **Cut a garment to length** with `material` returning null (hems, necklines,
  sleeve ends), and add hems, cuffs and ribbing with `{ ramp, shift }`.
- **Layering:** `torso` draws over `legs`, so tops tuck over skirts and trousers;
  `outer` sits over both. Keep hems in mind: a top that ends at y 108 leaves
  the skirt or trousers room to show.
- The front centre of the turned torso is x ~57; necklines, buttons, belts
  and prints centre there, not on x 60.
- **Details that must stay crisp** (prints, clasps, buttons, logos) are hand
  grids added as a second part in the same slot, in fixed ramps.

## Canvas and anchors

The canvas is **120 x 150** (Gaia's size). The avatar is in **3/4 view, turned
toward the viewer's left**, with Gaia's proportions: the head is ~35 px wide
and about a third of the figure's height. The far side (viewer's left) sits
back and is partly hidden; the near side (viewer's right) comes forward.

| Landmark            | Where (x, y)                                                      |
| ------------------- | ----------------------------------------------------------------- |
| Headroom for hats   | y 0 - 30                                                          |
| Cranium             | centre (63, 49), radius ~17.5: x 45 - 81, top at y 32             |
| Chin                | (54, 68); the face sits toward the lower left                     |
| Brows               | y 46 - 48                                                         |
| Far eye (narrow)    | x 45 - 50, y 51 - 59                                              |
| Near eye (full)     | x 54 - 61, y 51 - 59                                              |
| Cheeks / blush      | y 61, under each eye                                              |
| Mouth               | x 51 - 57, y 62 - 65                                              |
| Ear                 | (79, 54), usually under hair                                      |
| Neck                | x 56 - 66, y 63 - 75; choker line y 69 - 73                       |
| Shoulders           | m: (47, 77.5) and (75, 77.5); f: (49, 78) and (73, 78)            |
| Torso               | chest y 84, waist y 95, hips y 103; front centre x ~57            |
| Hands               | m: far (38.5, 106), near (84.5, 106); f: (41, 106) and (82, 106)  |
| Legs                | thighs y 104 - 121, shins y 121 - 138                             |
| Feet (ground ~146)  | far (46, 141.5), near (65, 142.5), toes toward the left           |

Items may go past the body (wings, cloaks, big hats, held props), but keep
everything on the canvas.

## Layers and equipping

Two separate ideas, which Gaia blurred together:

- **Draw layers (`slot`)** decide *depth*. Every part of an item goes on one
  layer, and one item can have parts on several layers.
- **Equip categories (`category`)** decide *what can be worn together*. Each
  item has one category, and an outfit can hold a limited number of items per
  category (`CATEGORIES` in `scripts/avatar-art/lib.mjs`). An item can also
  `"occupies": [...]` extra categories, e.g. a two-handed scythe occupies
  `held_near` and `held_far`.

Draw layers, back to front (`SLOTS` in `lib.mjs`):

| Slot         | Use for                                                           |
| ------------ | ----------------------------------------------------------------- |
| `background` | scenes and backdrops, full canvas                                 |
| `back_fx`    | auras and glows behind the avatar                                 |
| `wings`      | wings, big tails                                                  |
| `back`       | things worn on the back: sheathed weapons, packs, cape backs, hood insides |
| `hair_back`  | hair behind the head                                              |
| `held_back`  | held-item parts behind the body or hand: grips (so fingers wrap them), far-hand props |
| `body`       | the base body only                                                |
| `face_paint` | blush, scars, stitches, makeup, markings                          |
| `eyes`       | eyes (one item: both eyes)                                        |
| `mouth`      | mouths and expressions                                            |
| `brows`      | eyebrows (sit under the fringe, like Gaia)                        |
| `legwear`    | stockings, tights, socks (under skirts, trousers and shoes)       |
| `legs`       | trousers, skirts, shorts                                          |
| `feet`       | shoes, boots                                                      |
| `torso`      | shirts, tops                                                      |
| `waist`      | belts, sashes, hip sheaths, pouches                               |
| `outer`      | coats, jackets, cape fronts, armour                               |
| `strap`      | straps and bandoliers across the chest                            |
| `neck`       | scarves, collars, necklaces                                       |
| `hands`      | gloves, bracelets, rings                                          |
| `face_acc`   | masks, glasses, eyepatches                                        |
| `hair_front` | fringe and front locks                                            |
| `hair_acc`   | clips, ribbons, flowers                                           |
| `head`       | hats, hoods, horns, crowns                                        |
| `held`       | held items in front of everything                                 |
| `companion`  | familiars on the shoulder or floating nearby                      |
| `front_fx`   | glows and particles over everything                               |

Equip categories and how many of each an outfit can wear: `body`, `eyes`,
`mouth`, `brows`, `hair`, `head`, `face_acc`, `torso`, `outer`, `waist`,
`hands`, `legs`, `legwear`, `feet`, `back`, `wings`, `held_near`, `held_far`,
`companion`, `aura` and `background` allow one each; `face_paint`, `hair_acc`
and `neck` allow two. The build rejects outfits that break these limits.

**Split items across layers wherever real objects would be.** Examples:

- *Graveblade (Sheathed)*, category `back`: scabbard and hilt on `back` (behind
  the body, hilt poking over the shoulder), strap on `strap` (across the chest).
- *Graveblade (Drawn)*, category `held_near`: grip on `held_back` so the
  hand's fingers draw over it, guard and blade on `held`, a glint on `front_fx`.
- *Long Wisp*, category `hair`: `hair_back` and `hair_front`.
- *Candlewick Hat*, category `head`: hat on `head`, flame on `front_fx`.

Held items follow the hand, which differs per build, so sculpt them with
`bodyFor(build).anchors.hand` (see `sculpts/weapons.mjs`).

**Stacking is fixed, like Gaia's.** Layers draw in the slot order above, and
the order someone puts items on never matters. If two kinds of item can share
a slot and one belongs over the other, either give it its own slot (that's why
stockings are `legwear`, not `legs`) or set `"order"` in `item.json`: higher
draws on top within the slot (default 0; e.g. the sweater is 1 so it goes over
any tee).

`hides` in `item.json` removes other items' slots, for example a full helmet
might hide `hair_front`. Only use it when no drawing could work instead.

## Palette

Only colours from `palette.json` are allowed. Each ramp has 5 shades:

| Shade | Use                                                                 |
| ----- | ------------------------------------------------------------------- |
| 0     | outlines only (the auto outline uses it)                            |
| 1     | deep shadow, creases, the inside of things, the darkest folds       |
| 2     | shadow side, fold lines, the undersides of shapes                   |
| 3     | base colour (most of the surface)                                   |
| 4     | highlights: top edges, rims facing the viewer, shine. Use sparingly |

The ramps already shift hue (darks lean purple, lights lean warm). Do not
fake shading with a different ramp.

**Light comes from the upper left, slightly in front** (the sculptor's light).
The upper-left parts of every form are lit, and the lower-right parts,
undersides and anything under an overhang are in shadow. Highlights (shade 4)
land top-left, and eye shines go top-left too.
- **No pillow shading.** Don't just darken all edges evenly; shade by form.
- **No banding.** Avoid parallel shade stripes that follow the outline.
- **No stray single pixels**, unless they are deliberate sparkle. Sculpts clean
  these up automatically; hand-drawn grids need checking by eye.

Adding a ramp: 5 new unique colours, darkest to brightest, shifting hue the
same way the others do. The build rejects duplicates, because recolouring
matches exact colours.

## Recolouring

These ramps are placeholders that get swapped per avatar or per item:

| Ramp          | Swapped by              | Use it for                                                 |
| ------------- | ----------------------- | ---------------------------------------------------------- |
| `skin`        | avatar skin tone        | anything that is the wearer's skin (base body, ears, mouth) |
| `hair`        | avatar hair colour      | hair and brows                                             |
| `eyes`        | avatar eye colour       | irises                                                     |
| `dye1`/`dye2` | per item, in the outfit | the main colour and accent of dyeable items                |

Give every dyeable item a good default in `item.json` (`"dyes": { "dye1": "night" }`).
Keep metal, bone, gems and other "material" details on fixed ramps (`gold`, `steel`,
`bone`) so the item keeps its character whatever it is dyed.

Skin tones on offer: `skin`, `skin_pale`, `skin_deep`, `skin_zombie`,
`skin_ghost`, `skin_demon`.

## Outlines

`outline: auto` wraps each part in a 1px outline using shade 0 of whichever
ramp it touches (selective outlining: red cloth gets a dark-red outline, not black).
- Leave room: the outline is drawn *outside* the grid's pixels.
- Use `outline: none` for face details, effects and glows, and for parts
  whose outline you draw by hand.
- Inside a shape, separate forms with shades 1-2, never with `ink`.

## Part file format

```
# comments
at: X,Y          top-left of the grid (with mirror: yes, only Y is used)
mirror: yes      rows are the LEFT half; they are mirrored and centred
outline: auto    or none
legend:
  a = dye1.3     one character = ramp.shade
  k = ink.0
---
..aak..          '.' is transparent; every row the same width
```

`item.json`:

```json
{
  "name": "Candlewick Hat",
  "category": "head",
  "parts": [
    { "slot": "head", "file": "hat.txt" },
    { "slot": "front_fx", "file": "flame.txt" }
  ],
  "dyes": { "dye1": "violet", "dye2": "gold" },
  "hides": []
}
```

Several parts can share a slot; they are drawn in the listed order. A part
can also have `"build": "f"` or `"m"` (fitted to one body) and `"sculpt"`
(see Sculpting). Parts without a build suit both bodies.
`mirror: yes` exists, but in 3/4 view almost nothing is symmetric; avoid it.

## Swappable faces

Faces are built from separate items, like Gaia: `eyes`, `mouth`, `brows` and
`face_paint`, with `face_acc` on top for masks and glasses. Each is its own item,
so any eyes work with any mouth. Draw face parts straight into grids at the
anchors above, with `outline: none`. An item that replaces the whole face (a
skull head, say) should use `hides` on the face slots it replaces.

## The bar: no bland items

This is a horror arcade, not a mall. Every item must pass these:

- **Silhouette first.** It should be recognisable as a solid black shape. If
  it only changes colour inside the body outline, it is a recolour, not an item.
- **One focal detail.** A clasp, a stitched seam, a glowing eye, a crack. Put
  the brightest shade 4 there and almost nowhere else.
- **Wraps around properly.** Hoods have an inside, capes have a back, long hair
  has strands behind the shoulders. Use the back slots.
- **Respects the turn.** The far side is narrower and partly hidden; the near
  side is wider and overlaps. Check it doesn't look pasted on flat.
- **Story.** Name it like loot ("Gravewarden Hood", not "Black Hood").
- **Tiers:** common items are dyeable basics done well. Rare items change the
  silhouette (horns, wings, huge collars, tails). Legendary items add an
  `_fx` layer (glow, embers, mist, wisps) or something alive (a familiar, a
  floating lantern).

Idea bank: stitched rag-doll skin seams, cracked porcelain mask, moth wings,
jack-o'-lantern head with candle glow, bone crown, raven familiar on the
shoulder, chain-wrapped coffin backpack, plague doctor mask, witch hat with
a crooked tip and a live candle, bat-ear hood, tentacle hair, a halo of
floating eyes, lantern-jaw anglerfish hood, graveyard mist aura.

## Checklist before calling an item done

- [ ] `npm run art:avatar` passes.
- [ ] Looked at the preview at 4x, and it still reads at 1x (squint).
- [ ] Shown on at least two skin tones and two dye choices.
- [ ] Clothing checked on both builds.
- [ ] Worn with hair and with the other slots it overlaps (hood + hair, coat + held item).
- [ ] No hand-drawn black lines inside shapes; shade 4 is used sparingly.
- [ ] An outfit in `avatar-art/outfits/` shows it off.
