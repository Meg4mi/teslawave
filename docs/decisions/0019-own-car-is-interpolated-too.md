# 0019. Your own car is interpolated too, and the camera pauses on touch-down

Status: accepted
Date: 2026-09-04

## Context

"The map is a bit laggy when I turn."

Every other car on the map is interpolated between server samples, so it glides. Your own car
was drawn straight from the raw fix — and `watchPosition` delivers about one fix a second. So
the camera held still for a second and then jumped: at 100 km/h a 28 metre step, and through a
bend the entire turn arriving in a single frame. Not slow frames. A camera moving in
one-second increments.

Fixing that exposed a second problem underneath it. Once the camera moved every frame instead
of once a second, gestures stopped working entirely — and that turned out to be the real cause
of the pinch complaint that ADR-0017 had only partly addressed.

## Decision

**Your own placement is smoothed** (`sim/self.ts`): the last fix is dead-reckoned forward at
frame rate, and the drawn position eases toward that with a 320 ms time constant (420 ms for
heading, along the shortest arc). A new fix bends the camera rather than teleporting it. The
cost is about a third of a second behind the truth, against the two full seconds already
accepted for everyone else.

**The camera pauses the instant a pointer lands on the map**, before we know what the pointer
is for. It has to: a `jumpTo` between the touch landing and its first movement cancels the
gesture inside MapLibre before it becomes one — no `dragstart`, no pan, no pinch — and at
thirty frames a second there is always one in that gap. ADR-0017 waited for the first movement
to pause, which is one frame too late; and it detected gestures from MapLibre's own
`dragstart`, an event that a following camera prevents from ever firing.

A tap therefore pauses the camera too, for as long as the finger is down. Lift it without
having travelled and the camera resumes on the spot, so tapping a car to see who it is costs
nothing. Only a gesture that actually moved leaves the camera held, and only that shows the
pill.

**While a pointer is down, or the map is turning faster than 6°/s, our own per-frame work
stands aside** — trails. The map is re-tessellating every frame in both
cases, which on an Intel Atom is the whole budget, and `queryRenderedFeatures` against a map
in that state is the worst possible moment to ask.

## Rejected alternatives

- **Update the camera bearing less often.** Fewer repaints, and back to a stepping map. The
  complaint was smoothness, not frame rate.
- **Quantise the bearing to whole degrees.** Same trade, smaller.
- **Rotate the map container with a CSS transform** and keep MapLibre north-up. Rotation
  becomes free, and every label rotates with it, including upside down.
- **Keep detecting gestures from MapLibre's events and suppress `jumpTo` some other way.**
  There is no other way: the camera and the gesture want the same transform, and only one of
  them can be authoritative while a finger is down.

## Consequences

`getSelfPlacement()` now returns a value that changes every frame rather than once a second,
which is what the camera, the sprite and the direction cone all read. Distances still come
from `setSelfReported`, the position as sent, unchanged — smoothing is about pixels, and the
wave prompt must still agree with the server (ADR-0012).

`?sim=lat,lng,heading,speed,turn` gained the turn rate, in degrees per second, so a bend can be
driven on demand. Without it there was no way to test any of this: the e2e suite now asserts
the map turns continuously rather than once a second, and the perf spec measures a turn
separately from a pan, because turning is the expensive case and was being assumed to behave
like panning.
