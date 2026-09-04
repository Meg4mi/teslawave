# 0012. Your own car is drawn from the raw fix, everyone else from fuzzed data

Status: accepted
Date: 2026-09-04

## Context

Positions are blurred by 50-100 m before they leave the device. If your own car were drawn
from the blurred position, it would sit in a field next to the motorway you are on, and the
first thing every driver would conclude is that the app is broken.

## Decision

Your own car is drawn from the raw local fix, which never leaves the browser. Every other car
is drawn from the fuzzed position the server sends. Distances, and therefore the wave prompt,
are measured from the **fuzzed** self position, because that is what the server validates
against.

## Rejected alternatives

- **Draw yourself fuzzed too**: consistent, and visibly wrong on the road you can see.
- **Measure distance from the raw fix**: the prompt would appear up to 100 m before the
  server would accept the wave, so some waves would be offered and then refused.

## Consequences

Two positions for yourself, with one rule: the raw one is for pixels, the fuzzed one is for
anything compared against another car. `setSelfPlacement` and `setSelfReported` are separate
functions so the distinction is visible at every call site.
