# 0018. Each model is traced, not parameterised

Status: accepted
Date: 2026-09-04

## Context

The five car sprites were one parametric shape with different numbers in it: six points down
the flank, joined by `arcTo` with a corner radius, plus a greenhouse built from two quadratic
curves. Every model came out as a rounded rectangle with a rounded rectangle on top.

Successive rounds of nudging those numbers — real dimensions, a roof bar for the Model 3,
falcon seams for the X — improved things and never got past the ceiling. A Model S and a Model
Y remained the same object at slightly different proportions, because a shared shape generator
is what they were. The remaining differences between real Teslas from above are curvature: how
a bonnet falls away, how bluntly a hatchback ends, how far a windscreen reaches back. A corner
radius cannot express any of them.

## Decision

Each model is its own drawing. `overlay/model-art.ts` holds, per model, a chain of cubic
bezier segments down the right-hand flank from nose to tail, mirrored to close; a separately
traced greenhouse; and the wheels, mirrors, lights and panel gaps as real measurements.
`overlay/sprites.ts` is now only the painting.

Coordinates are **millimetres of the real car**, origin at the centre of the body. Working in
real dimensions means the proportions cannot drift, and the published length, width, wheelbase
and front overhang are checkable against the geometry — `model-art.test.ts` checks them, along
with two things hand-authored curves get wrong: that a half-outline meets its own mirror image
with a horizontal tangent (otherwise there is a crease down the nose), and that no two models
come out as the same silhouette.

Sprites are also now drawn to a single millimetres-per-pixel factor, so a Cybertruck is a fifth
longer than a Model 3 on screen, as it is on the road. The renderer scales by the reference
length rather than by each sprite's own.

## Rejected alternatives

- **Trace real overhead photographs.** What was asked for, and not something to do with press
  images: the good overhead shots of these cars are copyrighted, and a traced derivative of one
  is still a derivative. The geometry here is authored from published dimensions and from the
  features that distinguish the cars, which is where the fidelity actually comes from.
- **Ship SVG files and rasterise them.** Same drawings, plus a parser, plus five assets to
  fetch on LTE. The path data is small enough to be source.
- **Keep parameterising, with more parameters.** Two rounds of that had already been spent.
- **One shared outline, per-model scale.** What we had.

## Consequences

The art is data, and the data is checked. Adding a model means tracing one, not finding
numbers that bend the template far enough. The cost is roughly 200 lines of coordinates that
only a rendered image can really validate, which is why the geometry tests assert the
invariants a picture would not show — symmetry, proportion, and that the five are five.
