# 0005. Cars are drawn on one 2D canvas above MapLibre

Status: accepted
Date: 2026-09-04

## Context

Twenty cars, each rotated to its heading, each with a glow and a fading 30 s trail, redrawn
at 60 fps on an Intel Atom.

## Decision

One `<canvas>` over the map, `pointer-events: none`, redrawn from a single rAF loop.
Sprites are rasterised once per (model, colour, dpr) with the glow baked into the bitmap and
blitted with `drawImage`. Hit testing projects each car and picks the nearest within 40 px.

## Rejected alternatives

- **A MapLibre symbol layer with `setData` per frame**: every update re-tiles the GeoJSON
  source and re-uploads buffers. That is the map's slow path, sixty times a second.
- **DOM markers**: each marker is a compositing layer, and twenty of them moving every frame
  is a layout and paint storm. Also impossible to draw trails with.
- **A second WebGL context**: two GL contexts on an Atom, for shapes a 2D canvas draws in
  under a millisecond.

## Consequences

Our own per-frame work is 3-4 ms with twenty cars under 6x CPU throttling, gated by
`e2e/perf.spec.ts`. The renderer takes a `project` function rather than a map, so it can be
exercised without MapLibre at all (that is how `/kitchen-sink` works).

The camera is deliberately not driven at 60 Hz: every `jumpTo` repaints the whole vector map,
while the eye is tracking the sprites, which keep animating because the overlay redraws
regardless. Decoupling them took the software-rendered frame rate from 14 to 26 fps, and a
car standing at a light stops repainting the map altogether.
