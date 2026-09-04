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

## Consequences

If OpenFreeMap ever limits the public instance, the migration is to a Protomaps PMTiles
archive on R2 (free tier, 10 GB): swap the `sources` entry and the `glyphs` URL at the top of
the file. Nothing else changes, which is why those two values are constants at the top rather
than scattered through the layer list.

The style is deliberately not a large JSON asset: it is fifty lines of typed code, so a
layer that costs frames is visible in review.
