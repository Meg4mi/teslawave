# 0009. Adaptive position send rate

Status: accepted
Date: 2026-09-04

## Context

Every inbound WebSocket message is billed (20:1) before our code runs, and requests, not
duration, are the binding free-tier constraint (0002). A fixed 5 s rate costs 54,000
request-equivalents a day at launch volume; the budget is 100,000.

## Decision

Send a position when the heading changes by more than 20 degrees, when the speed changes by
more than 15 km/h, every 5 s while moving, and every 30 s while stationary, never more often
than every 2 s. Implemented as a pure function, `shouldSendPos`, with a truth-table test.

## Rejected alternatives

- **Fixed 5 s**: simpler, and it still fits at launch, but it halves the headroom for growth
  and doubles what a parked car costs.
- **Pure event-driven (send only on change)**: a car cruising in a straight line would stop
  reporting and be evicted after 60 s.

## Consequences

About 37% fewer messages at the same visual quality, because interpolation and dead reckoning
already carry the car between updates. A parked car costs a sixth of what it used to.
