# 0004. Position fuzzing as a bounded random walk

Status: superseded by 0024
Date: 2026-09-04

## Context

Positions must be fuzzed by 50-100 m on the client before anything leaves the device, and
the map must still look like cars gliding along roads.

## Decision

A single offset vector per page load, magnitude kept between 50 m and 100 m, drifting by at
most 5 m per update in a random direction. The reported position is the true position plus
the offset, rounded to 5 decimals.

## Rejected alternatives

- **A fresh random offset per update**: up to 150 m of jitter every 5 s. Cars would twitch,
  and interpolation could not hide it.
- **A fixed offset for the session**: perfectly smooth, but the exact shape of the trip is
  preserved and merely translated, which is barely anonymised at all.
- **Snapping to a grid**: cars would jump between grid points and cluster unnaturally.

## Consequences

Motion stays smooth, the reported track is a plausible but wrong path, and the offset does
not survive a reload. Wave validation uses a server-side range 150 m wider than the one the
client prompts at, so a wave that is offered is one that will be accepted (ADR-0007: 300 m
to prompt, 450 m to accept, since amended from 150/300).
