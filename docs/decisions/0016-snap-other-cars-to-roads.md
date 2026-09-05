# 0016. Other cars are drawn on the road they are plausibly on

Status: superseded by 0024
Date: 2026-09-04

## Context

ADR-0012 settled that your own car is drawn from the raw fix and everyone else from the
fuzzed position the server sends. On a real car screen the consequence is what the driver who
asked for this described: the other Teslas look *à côté de la route* — beside the road, in
fields and car parks and the middle of the lake.

That is the fuzz doing exactly what ADR-0004 asks of it. The offset is 50–100 m in a random
direction, and on a motorway 75 m sideways is a field. Fuzzing less is not on the table: it is
the whole privacy guarantee, and the brief calls it non-negotiable.

But the sideways part of the offset is not what protects anyone. What protects a driver is not
knowing *where along* a road they are, and that is most of the 50–100 m. The sideways
component only makes the map look broken.

## Decision

For **display only**, each other car is moved onto the road it is most plausibly on, if there
is one within 130 m of where the server put it. The position we send, store in the hub and
validate waves against is untouched, still exactly as fuzzed as ADR-0004 requires.

The road is chosen from the ones MapLibre has actually rendered around the car, scored on
distance adjusted for plausibility: a road running across the car's heading is penalised (a
car doing 110 km/h north is not on the perpendicular slip road 20 m away), and above 80 km/h a
motorway or trunk road is preferred over a residential street. Below 12 km/h heading is
ignored, because a parked car's last heading means nothing. If nothing scores inside 130 m,
the car is left where the server put it rather than dragged onto an invented road.

Corrections ease in over about 200 ms and are recomputed at most every 800 ms per car, at most
two cars per frame, so a sprite never jumps and `queryRenderedFeatures` never becomes the
frame budget.

`RenderCar` carries both positions: `placement` is where the sprite goes, `reported` is what
the server sent. Distances — and therefore the wave prompt — read `reported`. The snapper is
also fed `reported`, never `placement`, so a correction can never be measured from a position
that already carries one and walk the car down the road.

## Rejected alternatives

- **Fuzz less.** Solves the picture, breaks the promise. Not available.
- **Snap on the server.** The server would have to hold road geometry, and every client would
  see the same corrected position — which makes the correction part of the record rather than
  part of the drawing.
- **Snap the trail separately.** Trail points are pushed from `placement`, so they inherit the
  correction at the moment they were laid down and stay attached to the car for free.
- **Nearest road, no scoring.** Cheap, and confidently wrong: with a 75 m offset, "nearest"
  picks the parallel service road about as often as the motorway.
- **Do nothing and explain the fuzz in the UI.** Nobody reads that, and the map still looks
  broken.

## Consequences

The displayed position now says "this driver is on this road", which the raw fuzzed dot only
implied. That is a real, if small, reduction in what the fuzz hides — an observer could have
guessed the road from a 75 m offset anyway. What it does not reduce is the along-the-road
error, which is the part that matters and is untouched.

The correction is bounded by 130 m, so a bad snap is bounded too, and it degrades to nothing:
below zoom 13, before tiles load, or where no road is rendered, cars are simply drawn where
the server put them.
