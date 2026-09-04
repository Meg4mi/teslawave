# 0021. The map's resolution follows the measured frame rate, and the overlay projects for itself

Status: accepted
Date: 2026-09-04

## Context

Two costs on the frame that were paid in full every time, whatever the screen could afford.

**The vector map was always drawn at the device's pixel ratio.** 2026.26 doubled the car
browser's density, and a map at 2x is four times the fill work of the same map at 1x: every
road, every label halo, every tile, on an Intel Atom whose GPU was already the bottleneck
while turning. Nothing in the app may _assume_ a density (ADR-0014, `check:css`), and nothing
did, but reading it and then rendering at it regardless is a different mistake with the same
result.

**The overlay projected every point through `map.project`.** Each car, each of up to sixty
trail points per car, each ring anchor, every frame: with twenty cars that is over a thousand
calls into MapLibre's transform, each a matrix multiply and a `Point` allocation. The trails
then took a `stroke()` per segment on top, twelve hundred strokes a frame.

## Decision

**Once frames are measured slow, the map is rendered at a pixel ratio of at most 1.** The
same measurement that already drops the overlay to 30 fps (sixty frames over 28 ms) now also
lowers the map's resolution, and only the map's: the canvas the cars are drawn on keeps the
full density, so the sprites stay crisp and it is the roads and labels that soften. The
change is latched for the session. Restoring it on the strength of frames that were fast
_because_ the map was cheaper would flip the resolution back and forth every few seconds,
which is worse than either setting.

**The overlay builds its own projection once per frame.** With pitch disabled the map is flat,
and a flat map's projection is an affine map of Web Mercator coordinates: a rotation for the
bearing, a scale for the zoom, a translation for the centre. Three calls to `map.project`
recover it exactly, a fourth checks the recovery to half a pixel, and every point after that
is a handful of multiplications (`map/projector.ts`). If the check ever fails — the map put
into a mode where this stops being true — the overlay falls back to `map.project` for the
frame rather than drawing cars in the wrong place.

**Trails are quantised into six alpha levels** and drawn as one path per level, so a trail
is at most six strokes instead of sixty. The fade only ever falls from the car backwards, so
each level is one contiguous run. Trails of cars far off the screen are not walked at all.

## Rejected alternatives

- **Render the map at 1x always.** Simple, and it makes the car's own screen look worse than
  it needs to on the many drives where the frame rate is fine. The measurement exists; use it.
- **Restore the resolution after a long run of fast frames.** Every restore is a gamble that
  costs a visible flip, and there is no way to know whether 2x would be fast without trying
  it. A driver who wants it back gets it on the next boot.
- **Lower the overlay's density too.** The cars are what the eye tracks, and a soft car on a
  soft map is the thing this whole design exists to avoid. The overlay is cheap at 2x; the
  map is not.
- **Cache `map.project` results per point.** The points move every frame; there is nothing
  to cache.
- **A gradient stroke per trail.** One stroke, but a gradient created per frame is exactly
  what ADR-0014 bans on this hardware.

## Consequences

`map.setPixelRatio` is now called from the frame loop, once, when the latch flips, and the
resize handler respects the latch. A test can force the slow path by throttling the CPU, as
the perf spec already does; whether the threshold is right for a real car is a row for
`docs/tesla-notes.md`.

The projector's fallback means a future pitch or globe setting would silently cost the old
per-call price rather than break; the half-pixel check is what makes that safe.
