# 0006. A custom near-monochrome style on OpenFreeMap tiles

Status: accepted
Date: 2026-09-04

## Context

The cars must be the only colour on screen, the map must read at a glance while driving, and
every layer costs frames on an Intel Atom. OpenFreeMap serves OpenMapTiles vector tiles with
no key, no account and, per its own documentation, "no limits on the number of map views or
requests".

## Decision

Build the style object in code (`apps/web/src/map/style.ts`): a background, water, landcover,
three road tiers, admin boundaries, and city/town labels above zoom 12. Fewer than 25 layers.
No buildings, no POIs, no transit, no 3D, no hillshade. Attribution is mandatory and shown.

## Rejected alternatives

- **OpenFreeMap's own `dark` style**: many more layers than we need, and the colour balance
  competes with the cars.
- **Mapbox or another keyed provider**: a bill per map load, which the brief rules out.
- **Raster tiles**: heavier over LTE and blurry when rotated for a heading-up map.

## Contrast is part of the decision, not a detail

The first version of this palette was correct in every way except the one that mattered:
roads at 1.22-1.57:1 against the ground and water at 1.08:1. The map rendered perfectly and
looked like a black screen with a car on it. "Near-monochrome" is a colour decision; it is
not a licence to be invisible.

Minimums, measured against the ground (`#0e1319`), not eyeballed:

| Layer | Colour | Ratio | Floor |
|---|---|---|---|
| Motorway | `#7a8ca8` | 5.46:1 | 4.0:1 |
| Primary / trunk | `#5f7089` | 3.70:1 | 3.0:1 |
| Secondary / tertiary | `#4a586d` | 2.58:1 | 2.2:1 |
| Minor | `#3a4557` | 1.93:1 | 1.8:1 |
| Water | `#22405f` | 1.75:1 | 1.6:1 |
| Labels | `#aab6c6` | 9.07:1 | 7.0:1 |

Anything below its floor is a bug, not a style preference. The vignette counts too: it was
darkening the edges by 72%, which is exactly where roads are hardest to read, and is now 50%
and further out. Cars stay the only saturated thing on screen at 12.9:1.

## Consequences

If OpenFreeMap ever limits the public instance, the migration is to a Protomaps PMTiles
archive on R2 (free tier, 10 GB): swap the `sources` entry and the `glyphs` URL at the top of
the file. Nothing else changes, which is why those two values are constants at the top rather
than scattered through the layer list.

The style is deliberately not a large JSON asset: it is fifty lines of typed code, so a
layer that costs frames is visible in review.
