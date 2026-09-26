# Avatar art guide

Avatar art is drawn as text. Every item is a folder of pixel grids in
`avatar-art/items/<item_key>/`, built into PNGs by:

```
npm run art:avatar            # validate, export, render previews
npm run art:avatar -- --check # validate only
```

The build writes `public/avatar-v2/items/<item>/<slot>.png` (one PNG per slot the
item uses, full 96x144 canvas, canonical colours), `public/avatar-v2/manifest.json`,
and renders every outfit in `avatar-art/outfits/` to `avatar-art/previews/`
(4x, plus `_sheet.png` with all outfits side by side).

## How to work

1. Draw or edit the `.txt` grids.
2. Run the build. It refuses anything off-palette, off-canvas or malformed.
3. **Look at the preview PNGs** (open them with the image viewer / Read tool). Judge them
   honestly at 4x *and* think about how they read at 1x. Fix, rebuild, repeat.
4. Add or update an outfit in `avatar-art/outfits/` that shows the item, with at
   least one alternative skin tone and dye so recolouring gets checked too.

For large organic shapes it is fine to lay down a first pass with a throwaway
script (profiles, curves, dithering) and write its output to the `.txt`. From
then on the `.txt` is the source: refine it by hand and never re-run the
script over hand edits. Do not commit sketch scripts.

## Canvas and anchors

The canvas is **96 x 144**, front-facing, centred between columns 47 and 48.
Everything is drawn to fit the base body in `items/base_body/body.txt`.

| Landmark            | Rows (y)  | Columns (x)                  |
| ------------------- | --------- | ---------------------------- |
| Headroom for hats   | 0 - 29    | anywhere                     |
| Head (skull)        | 30 - 73   | widest at y 54: 26 - 69      |
| Brows               | 50 - 51   | 35 - 41, 54 - 60             |
| Eyes                | 54 - 63   | 34 - 41, 54 - 61             |
| Cheeks / blush      | 65        | 34 - 36, 59 - 61             |
| Mouth               | 67 - 68   | 46 - 49                      |
| Ears                | 52 - 61   | 24 - 25, 70 - 71             |
| Neck                | 74 - 79   | 43 - 52                      |
| Shoulders           | 79 - 83   | 27 - 68                      |
| Torso               | 78 - 107  | chest 34 - 61, waist 36 - 59 |
| Hands               | 99 - 105  | 26 - 31, 64 - 69             |
| Hips                | 104 - 113 | 35 - 60                      |
| Legs                | 108 - 133 | 36 - 46, 49 - 59             |
| Feet (ground = 139) | 134 - 139 | 35 - 45, 50 - 60             |

Items may go past the body (wings, cloaks, big hats, held props), but keep
everything on the canvas.

## Slots (draw order, back to front)

| Slot         | Use for                                                          |
| ------------ | ---------------------------------------------------------------- |
| `back_fx`    | auras, shadows, anything glowing behind the avatar               |
| `back`       | wings, tails, cape backs, the inside of hoods, backpacks         |
| `hair_back`  | hair mass behind the head                                        |
| `body`       | the base body only                                               |
| `face`       | eyes, brows, mouth, face paint, scars                            |
| `legs`       | trousers, skirts, tights                                         |
| `feet`       | shoes, boots                                                     |
| `torso`      | shirts, tops                                                     |
| `outer`      | jackets, coats, cape fronts, armour                              |
| `neck`       | scarves, collars, necklaces                                      |
| `hair_front` | fringe and front locks                                           |
| `head`       | hats, hoods, horns, masks, halos                                 |
| `held`       | props in the hands                                               |
| `front_fx`   | glows, particles, anything over the whole avatar                 |

**One item can use several slots.** That is how things wrap around the body.
For example, the Gravewarden cloak puts its lining and hood interior in `back`,
its panels and mantle in `outer`, and its hood shell in `head`. If an item has a
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

**Light comes from the top-front**, so shading is symmetric: tops and
forward-facing rims are lit, and undersides, sides and anything under an
overhang are in shadow. This is why most parts can be `mirror: yes`.
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
  "name": "Gravewarden Hood & Cloak",
  "category": "outer",
  "parts": [
    { "slot": "back", "file": "back.txt" },
    { "slot": "outer", "file": "outer.txt" },
    { "slot": "head", "file": "head.txt" }
  ],
  "dyes": { "dye1": "night", "dye2": "blood" },
  "hides": []
}
```

Several parts can share a slot; they are drawn in the listed order.

## The bar: no bland items

This is a horror arcade, not a mall. Every item must pass these:

- **Silhouette first.** It should be recognisable as a solid black shape. If
  it only changes colour inside the body outline, it is a recolour, not an item.
- **One focal detail.** A clasp, a stitched seam, a glowing eye, a crack. Put
  the brightest shade 4 there and almost nowhere else.
- **Wraps around properly.** Hoods have an inside, capes have a back, long hair
  has strands behind the shoulders. Use the back slots.
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
