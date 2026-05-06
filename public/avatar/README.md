# Avatar Sprite Assets

All avatar layers use the same canvas and anchor:

- 256x256 PNG
- transparent background
- front-facing doll pose
- no shadows, text, watermarks, or background
- aligned to the default body layer
- designed for stacked `<img>` rendering in `layer_order`

Prompt template for future generated items:

```text
Create an original cute spooky pixel-art avatar layer for Scareathon.
Canvas: 256x256, transparent background, front-facing doll avatar pose.
The layer must align exactly with the existing Scareathon avatar body:
head centered at x=128 y=72, torso centered at x=128 y=128, feet around y=208.
Only draw the requested item/layer. Leave all other pixels transparent.
No background, no shadow, no text, no watermark.
Style: crisp pixel art, limited palette, playful Halloween arcade mood.
```
