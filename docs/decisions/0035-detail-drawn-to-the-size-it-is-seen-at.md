# 0035. Detail is drawn to the size it is seen at

Status: accepted
Date: 2026-09-07

## Context

ADR-0020 made the car one drawing rendered two ways, and a day of work on it added what a
top-down photograph of a Tesla actually shows: wipers parked on the glass, the camera
housing, bonnet creases, door cuts, the wheel arches, a painted roof rail, painted roof
panels. Each was right on its own. Together, at the size a car is drawn on the map and in
a toast, they were noise: a 58 px sprite with specks on the paint and a smudge on the
windscreen, and the clean glossy object it had been the day before was gone. At hero size
the same marks were busy too — hard black roof bar, hard light edge on the greenhouse,
curved wipers that read as eyebrows — and the lamps had lost their glow.

The temptation was to take the detail out again. That throws away the work and gives back
a car that is right at 46 px and thin at 560.

## Decision

The scene keeps every feature, and each operation says whether it is fine detail. A
renderer drops the fine operations when the car is shorter than `FINE_DETAIL_PX` (150 CSS
pixels): the map sprite, the chip and the toast get paint, glass, lamps, mirrors and an
outline; the hero, the card and the share image get everything. Both renderers read the
same flag, so the small car is a simplification of the large one, never a different
drawing.

The painting itself is toned to Tesla's own renders rather than to a photograph: the
greenhouse edge is a soft gradient and not a line, the roof bar and roof panels are body
colour lit by the body's own gradient, the roof rail is a thin line of the same, the
wipers are straight, the lamps spill a little light onto the paint, and every added mark
is a shade quieter than it was.

## Rejected alternatives

- **Remove the detail.** Fewer lines and a worse hero; the picker exists to show a driver
  their own car.
- **Two scenes, one per size.** Two drawings that drift, which ADR-0020 was written to end.
- **Let each renderer decide by its own heuristics.** Then the SVG chip and the canvas
  sprite would disagree on what a small car is. One threshold, in the scene module.

## Consequences

A feature added to the drawing has to say which kind it is. The default is coarse, so a
forgotten flag shows up on the map, where `/art` renders every model beside its sprite and
the mistake is visible. `model-art.test.ts` checks that a scene without its fine detail is
still a whole car.
