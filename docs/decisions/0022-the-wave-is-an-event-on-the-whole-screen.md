# 0022. The wave is an event on the whole screen, not a ripple on one sprite

Status: accepted
Date: 2026-09-05

## Context

The wave is the product (ADR-0007), and the first version of it on screen was three 2 px
rings growing from 14 px to 84 px around the other car in 900 ms, a 5 px dot flying for
400 ms, and a 56 px toast with 15 px type. Designed as an accent to the chime. On a 17"
screen watched from the corner of an eye at motorway speed, none of it registered, and the
chime cannot be relied on: browser audio in the car is the one thing we cannot test without
the car, and a driver may have it muted anyway.

So the visuals have to carry the moment alone, under the MCU 2 rules (ADR-0014): canvas arcs
with `globalAlpha`, baked bitmaps, DOM animating only `transform` and `opacity`, and nothing
allocated per frame.

## Decision

One wave is one choreography on one clock (`WAVE_TIMING` in `overlay/renderer.ts`), about
two and a half seconds long, because nothing under a second reads on a car screen:

| When | What |
|---|---|
| 0 – 600 ms | A comet (a head and six fading ghosts) flies from one car to the other. |
| 0 – 1000 ms | The line between the two cars lights up solid, then lets go. |
| 520 ms | The car the wave lands on pops to 130% and back, and an impact ring leaves it. |
| received: 0 – 2400 ms | Five 5 px warm rings leave the *sender's* car and grow until they have crossed the whole screen, whichever corner the sender is in. The wave arrives at you. |
| sent: 520 – 2500 ms | Three 3 px cyan rings leave the car you waved at and travel 260 px. Yours is a nod, not a flood. |
| received: 0 – 900 ms | The edges of the screen flash warm once (DOM, opacity only) and the element is unmounted. |
| received: 0 – 4300 ms | A card at the top of the screen: their car at 96 px in its real paint, their description at 32 px, and "waved at you" or "waved back". |
| received | The wave button comes back for the sender, warm, reading "Wave back", for a full window, even if their earlier window had run out. |

Colour stays as it was: cyan is you and what you do, warm is a wave arriving. The rings ease
gently and hold their opacity before dropping: the first cut used a sharper ease with a linear
fade, and each ring had left the screen, faint, by half its life, so the whole shockwave was
over in a second. `overlay/renderer.test.ts` records the arcs frame by frame and pins this:
the first ring reaches the farthest corner at the end of its life, still legible midway.

## Rejected alternatives

- **A stronger glow on the sprite** (a third baked variant crossfaded in). Cheap and pretty,
  but still confined to a 46 px sprite: it does not solve visibility, which was the problem.
- **A looping edge glow while the sender is in range.** A full-screen composited layer costs
  a few milliseconds of every frame in software compositing (the wave button's looping halo
  cost a millisecond at a tenth of the area). A one-shot 900 ms animation on an element that
  then leaves the DOM is a different thing: no resident layer, no per-frame cost after it.
- **Nudging the map itself** (a shake or a zoom pulse). Every camera move repaints the whole
  vector map, which is the most expensive thing on screen (ADR-0005).
- **A bigger toast.** The toast is a pill for one line of text; the received moment needs the
  car, and a `role="status"` region that a driver can read at a glance is a card, not a pill.
- **Screen-sized rings on send too.** The sender is already looking; flooding their screen for
  a tap they just made reads as noise, and the received case must stay unmistakably different.

## Consequences

- The renderer's per-frame cost during a wave is a handful of extra strokes and one scale, for
  under three seconds; the perf spec's frame-cost gate covers it.
- `/kitchen-sink` fires sent, received and waved-back side by side, with the card, the flash
  and the wave-back button, so timings are judged there and not on a motorway.
- The `docs/design-qa.md` wave moments now describe this choreography; the real car test is
  whether a received wave is noticed without looking for it.
