# 0020. One car drawing, rendered as SVG in the UI and baked to bitmap on the map

Status: accepted (supersedes the painting half of 0018; its geometry rules stand)
Date: 2026-09-04

## Context

ADR-0018 gave each model its own traced outline, in millimetres, and that fixed the
proportions. The painting was still a canvas routine that filled the outline, dropped a dark
rounded rectangle on it for glass, and called it a car. At 46 px in the picker it read as a
capsule; at 150 px in the hero it read as a capsule with a window. A driver picking their
Model Y saw nothing that looked like a Model Y.

Two things were missing. The drawing had none of the features that make a Tesla recognisable
from above: the split glass roof of the 3 against the single panel of the Y, the frunk shut
line, the bonnet creases, the slim lamps and the light bars, the mirrors, the door cuts. And
the only renderer was a bitmap, so the hero could never be sharper than the sprite cache.

## Decision

The car is one scene, rendered two ways.

- `overlay/model-art.ts` holds the geometry: body, greenhouse frame, every glass panel,
  shut lines, creases, lamps, mirrors, wheels and door cuts, per model, in millimetres.
  Curves are authored as anchor points and smoothed (Catmull-Rom), with corners flagged
  where a panel edge is a corner, because anchor points can be checked against a published
  width and control points cannot. Symmetric shapes are the right-hand half, mirrored.
- `overlay/car-scene.ts` turns geometry plus a paint colour into a list of fill and stroke
  operations with gradients and clips: the lighting, the reflection band across the glass,
  the rim light on dark paint. Nothing in it needs a filter.
- `ui/CarSvg.tsx` emits that list as inline SVG, so the configurator hero at 760 px and the
  chip in a toast at 28 px are the same drawing at different sizes. `ui/CarChip` is now a
  thin wrapper over it.
- `overlay/sprites.ts` rasterises the same list once per (model, colour, dpr, variant) via
  `Path2D`, adds the glow and the ring, and caches it for the map.

`model-art.test.ts` keeps the invariants from ADR-0018 (published dimensions, mirror symmetry,
five distinct silhouettes) and adds that every panel sits inside the frame, every shut line
reaches the centreline, and the scene builds with valid path data for every clip it names.

## Rejected alternatives

- **Ship SVG files and rasterise them with an `Image`.** Five assets on LTE, an async sprite
  cache, and two copies of the drawing (file and whatever the UI draws) that would drift.
  Path data as source is a few kilobytes and one copy.
- **Render the map sprites from the SVG component via `foreignObject` or `drawImage(svg)`.**
  Asynchronous, and it puts the browser's SVG rasteriser on the frame path on MCU 2.
  `Path2D` from the same path strings is synchronous and cached.
- **Trace press photographs.** Still a derivative of a copyrighted image (ADR-0018). The
  features here come from published dimensions and from what actually distinguishes the
  cars.
- **Keep the canvas painting and add detail to it.** The hero would stay a scaled bitmap,
  and every feature would need writing twice once the UI wanted a vector.

## Consequences

The map sprite and the UI car can never disagree, because there is one drawing. Adding a
model means authoring one geometry block; both renderers pick it up. The scene costs about
sixty operations per sprite bake, which happens once per colour and model and is not on the
frame path. `/art` (development only) renders every model large, in any colour, beside its
map-sized sprite, which is the only honest way to judge a drawing.
