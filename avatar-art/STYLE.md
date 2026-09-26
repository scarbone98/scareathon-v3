# Avatar art guide

Avatar art is drawn as text. Every item is a folder of pixel grids in
`avatar-art/items/<item_key>/`, built into PNGs by:

```
npm run art:avatar            # validate, export, render previews
npm run art:avatar -- --check # validate only
```

The build writes `public/avatar-v2/items/<item>/<slot>.png` (one PNG per slot the
item uses, full 120x150 canvas, canonical colours), `public/avatar-v2/manifest.json`,
and renders every outfit in `avatar-art/outfits/` to `avatar-art/previews/`
(4x, plus `_sheet.png` with all outfits side by side).

## How to work

1. Rough out the shape with a **sculpt** (next section), or draw small things
   (eyes, mouths, flames, cracks) straight into a `.txt` grid.
2. Run the build. It refuses anything off-palette, off-canvas or malformed.
3. **Look at the preview PNGs** (open them with the image viewer / Read tool). Judge them
   honestly at 4x *and* think about how they read at 1x. Fix, rebuild, repeat.
4. Add or update an outfit in `avatar-art/outfits/` that shows the item, with at
   least one alternative skin tone and dye so recolouring gets checked too.

## Sculpting

Anything with volume (bodies, hair, hats, horns, clothing) starts as a sculpt
in `avatar-art/sculpts/*.mjs`: rough 3D shapes (`ellipsoid`, `sphere`, tapered
`capsule`) that `scripts/avatar-art/sculpt.mjs` lights from one fixed light
and snaps to palette shades. This is what keeps every item lit and shaded the same way.

```
node scripts/avatar-art/sculpt-cli.mjs avatar-art/sculpts/accessories.mjs horns > avatar-art/items/ram_horns/horns.txt
```

- Coordinates are canvas pixels, with z pointing toward the viewer. The body is
  centred on x = 60 (between pixels 59 and 60). The head's cranium is centred
  at (60, 58, 0) with radius 24; see the base body sculpt for every other part
  of the body. For symmetric things, build one side and mirror the *shapes*
  (`x -> 120 - x`, as `base_body.mjs` does), not the pixels, so the light stays right.
- Shapes in the same `group` melt together (`blend` px). Different groups
  overlap hard and get a dark contact line, which is how strands of hair,
  arms over torsos and folds read.
- `material` can be a function of (x, y, z) for bands, trims and cut-outs;
  `clip` removes pixels (face openings, scalloped edges).
- Commit the sculpt spec. The `.txt` it prints is the real source: sculpts
  get you 80% of the way, and the rest is touch-up by hand (cracks, stitches,
  shine, stray pixels). **Re-running a sculpt overwrites hand work**, so note
  touch-ups in the part's comment ("Hand touch-up: ...") and redo them if you
  re-sculpt.

## Clothing

Garments are sculpted from the body's own shapes in `avatar-art/sculpts/body.mjs`
(`torso`, `chest`, `hips`, `neck`, `upperArm`, `forearm`, `hand`, `thigh`,
`shin`, `foot`), grown with `inflate` so they sit on top. That way every
garment fits the base exactly, and fits again if the base changes. See
`sculpts/clothing.mjs`.

- **How much to inflate:** fitted tops and stockings 0.5-1, sweaters and
  trousers 1.5-2.2, shoes 1.3-1.6, anything bulky (coats, armour) 2.5+.
- **Cut a garment to length** with `material` returning null (hems, necklines,
  sleeve ends), and add hems, cuffs and ribbing with `{ ramp, shift }`.
- **Layering:** `torso` draws over `legs`, so tops tuck over skirts and trousers;
  `outer` sits over both. Keep hems in mind: a top that ends at y 122 leaves
  the skirt or trousers room to show.
- **Details that must stay crisp** (prints, clasps, buttons, logos) are hand
  grids added as a second part in the same slot, in fixed ramps.

## Canvas and anchors

The canvas is **120 x 150** (Gaia's size), a chibi **facing forward**, centred
on x = 60. Everything is drawn to fit `items/base_body/body.txt`.

| Landmark            | Where (x, y)                                                  |
| ------------------- | ------------------------------------------------------------- |
| Headroom for hats   | y 0 - 33                                                      |
| Cranium             | centre (60, 58), radius 24: x 36 - 84, top at y 36            |
| Chin                | (60, 84)                                                      |
| Brows               | y 58 - 60, over each eye                                      |
| Eyes                | left x 44 - 53, right x 66 - 75, y 63 - 73                    |
| Cheeks / blush      | y 76, under each eye                                          |
| Mouth               | x 56 - 63, y 79 - 82                                          |
| Ears                | (36, 66) and (84, 66), usually under hair                     |
| Neck                | x 55 - 65, y 80 - 92; choker line y 86 - 89                   |
| Shoulders           | (46, 97) and (74, 97)                                         |
| Torso               | y 92 - 125; neckline dips to y 95 at the centre               |
| Hands               | (41, 123) and (79, 123)                                       |
| Legs                | x 47 - 59 and 61 - 73; thigh y 120 - 131, shin y 131 - 143    |
| Feet (ground = 149) | (52, 145) and (68, 145)                                       |

Items may go past the body (wings, cloaks, big hats, held props), but keep
everything on the canvas.

## Slots (draw order, back to front)

| Slot         | Use for                                                          |
| ------------ | ---------------------------------------------------------------- |
| `back_fx`    | auras, shadows, anything glowing behind the avatar               |
| `back`       | wings, tails, cape backs, the inside of hoods, backpacks         |
| `hair_back`  | hair mass behind the head                                        |
| `body`       | the base body only                                               |
| `face_paint` | blush, scars, stitches, makeup, markings                         |
| `eyes`       | eyes (one item: both eyes)                                       |
| `mouth`      | mouths and expressions                                           |
| `brows`      | eyebrows (sit under the fringe, like Gaia)                       |
| `legs`       | trousers, skirts, tights                                         |
| `feet`       | shoes, boots                                                     |
| `torso`      | shirts, tops                                                     |
| `outer`      | jackets, coats, cape fronts, armour                              |
| `neck`       | scarves, collars, necklaces                                      |
| `face_acc`   | masks, glasses, eyepatches, face jewellery                       |
| `hair_front` | fringe and front locks                                           |
| `head`       | hats, hoods, horns, masks, halos                                 |
| `held`       | props in the hands                                               |
| `front_fx`   | glows, particles, anything over the whole avatar                 |

**One item can use several slots.** That is how things wrap around the body.
For example, the Long Wisp hair puts its fringe in `hair_front` and its long
back in `hair_back`, and the Candlewick Hat puts the hat in `head` and the
candle flame in `front_fx`. If an item has a
front and a back in real life, draw both.

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
- **No stray single pixels**, unless they are deliberate sparkle.

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

Several parts can share a slot; they are drawn in the listed order.
`mirror: yes` mirrors pixels, which flips the lighting too. Use it only for
unshaded, symmetric details; for shaded forms, mirror the sculpt shapes instead.

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
- **Not perfectly symmetric.** A face-on avatar gets stiff if every item is a
  mirror image. A crooked hat tip, a swept fringe or a scar on one side adds life.
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
- [ ] Worn with hair and with the other slots it overlaps (hood + hair, coat + held item).
- [ ] No hand-drawn black lines inside shapes; shade 4 is used sparingly.
- [ ] An outfit in `avatar-art/outfits/` shows it off.
