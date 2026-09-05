# 0026. A car parked for ten minutes is hidden until it moves

Status: accepted
Date: 2026-09-05

## Context

Positions are exact (0024), a parked car keeps reporting its last fix every 30 s for as long
as the tab is open (0009, and the stationary feed that keeps the hub fed when a device goes
quiet), and the tab on a car screen is open for as long as the car is awake. Put together: a
car in a driveway broadcasts its driver's home address, with their nickname on it, to
everyone in a 20 by 40 km cell, indefinitely.

The blur used to soften this and was removed for good reasons. Scope (same area, 60 s, never
stored) does not cover it: the car is in the area, and it is refreshed every 30 s.

## Decision

A car that has been stationary for **ten minutes** (`PARKED_HIDE_MS`) is hidden: the client
sends `hide`, so the hub drops it within a tick, and stops reporting. The moment a fix shows
it moving again the client sends `show` and a position straight away, so the car is back on
the map without waiting out the send interval. The wave button stays away while parked,
since the hub would refuse the wave.

The clock runs in the net layer from the speed of each fix, and also from the stationary
feed timer, because a parked car's fixes are exactly the ones that stop arriving. A fresh
socket is told `hide` right after `hello` when the car is parked, so a reconnect cannot
unhide it.

The banner says so, plainly, and the consent line and the privacy page say it before "Go".

## Rejected alternatives

- **Hide at once when the car stops.** A red light, a queue, a drive-through: the car would
  flicker off the map at every stop, and the Supercharger meeting that the wave is for would
  be impossible.
- **Coarsen the position instead of hiding it.** Coarse for one car among precise ones reads
  as a bug (0024 all over again), and a coarse position at the same spot for an hour still
  says where the car lives.
- **Keep a parked car visible; it was deliberately kept on the map before.** It was kept on
  the map so a stop at a charger did not make the car vanish for no reason. Ten minutes keeps
  that and drops the overnight case, which is the one that matters.

## Consequences

- A car sitting at a charger for more than ten minutes disappears. That is the price. A
  driver who wants to be seen while charging has the visibility toggle, which is one tap and
  overrides nothing here: turning visibility off and on does not unpark the car. Moving does.
- 0009's "a parked car costs a sixth" becomes "a parked car costs nothing after ten minutes".
