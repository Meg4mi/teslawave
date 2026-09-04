# 0017. The camera yields to the driver's hands

Status: accepted
Date: 2026-09-04

## Context

The map followed the driver unconditionally: up to thirty `jumpTo` calls a second, re-centring
and re-bearing on every one. Pinch-to-zoom on the Tesla screen was reported as barely working,
and that is why. MapLibre's two-finger handler computes its zoom from the movement of the
touch points against the current transform; if something else moves that transform between
frames, the gesture is reading deltas against a map that has already shifted under it. Panning
was worse: whatever you dragged was undone within 33 ms.

## Decision

Any real gesture — a pinch, a drag, a wheel — suspends the camera for six seconds. During that
time nothing calls `jumpTo`, so the gesture has the transform to itself.

A tap does not count. A tap on a car screen still jitters a pixel or two, and holding the
camera every time somebody tapped a car would mean it hardly ever followed. One finger has to
travel ten pixels; two fingers down is always a pinch and holds immediately.

The camera resumes by itself six seconds after the last gesture, and a "Back to my car" pill
appears while it is held for drivers who do not want to wait. Resuming restores the centre and
the bearing but **not** the zoom: if you pinched out to see what is ahead, you keep that view.

## Rejected alternatives

- **A recentre button and no automatic resume**, as phone navigation apps do. On a car screen
  at speed, a map that has quietly stopped following you is worse than one that interrupts.
- **Never let go, and fix the gesture handling instead.** The gesture handling is not ours;
  fighting a library's transform is not a fix.
- **Hold on any touch at all.** Simpler, and it makes tapping a car to see who it is stop the
  map following you for six seconds.

## Consequences

`jumpTo` now has one condition in front of it, and the hold is measured on the same monotonic
clock as the frame loop. The e2e suite covers all three cases: a drag holds the camera, the
camera comes back by itself, and a tap does not hold it.
