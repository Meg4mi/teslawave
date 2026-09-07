# 0031. The hub and the client are tested against each other, and a departure is per subscriber

Status: accepted
Date: 2026-09-07

## Context

Look at what the bugs found on a real car screen have in common:

- Cars blinked out at every cell border (`docs/tesla-notes.md`, 2026-09-04).
- Ghosts stayed on the map after a reconnect, because a welcome restates a cell.
- The whole map wiped when the hub woke from hibernation with empty presence.
- A car went offline for no reason when its fixes stopped but its socket did not.

None of them is a fault in the hub. None of them is a fault in the client. Every one is an
*ordering* bug between the two: what the hub says, in what order, and what the client does
with a message that arrives before or after another one. Both sides had good unit tests
throughout. The tests passed, because each side was correct about its own half.

Each was found by a person driving a car, and fixed afterwards with a unit test on one side
only — a test that would not have failed before the fix for the right reason, and in one case
would not have failed at all.

Both halves are pure and deterministic. That is what ADR-0013 bought when it pulled the hub
logic out of the Durable Object, and `sim/world.ts` has the same property on the client. Two
deterministic state machines can be run against each other with a virtual clock.

## Decision

**One test drives the real hub and the real client against each other**
(`apps/web/src/sim/roundtrip.test.ts`). The hub is `@teslawave/hub-core`, the client is
`sim/world`, and the only thing faked is time and the wire between them. `@teslawave/hub-core`
becomes a dev dependency of the web app for this.

It covers the named cases — a border crossing, a hibernation wake, a clean close, a socket
that stays open while the positions stop, a driver who left while our socket was down — and
then a 150-tick drive with drops, wakes and crossings shuffled together on a seeded
pseudo-random schedule, asserting two invariants on every driver on every tick:

- a driver who is reporting is on the map;
- a driver who stopped reporting is off it within the expiry.

**Invariants are checked after every message, not once per tick.** This is the part that
matters, and it is what the first draft got wrong. A crossing produces two diffs — gone from
the old cell, updated in the new one — and a client that mishandles the departure still ends
up correct once both have been applied. On the wire they are two separate frames with the
render loop free to draw between them, so "correct after both" is precisely the bug. A rig
that only looks at tick boundaries cannot see it.

**And a departure is per subscriber, not per cell.** The rig failed on code that was believed
fixed, and it was right to. The client's guard from 2026-09-04 — delete on a `gone` only if
the car is still in the cell the message names — works only when the update happens to arrive
before the departure. Which of the two comes first depends on which cell was marked dirty
first, so as soon as any other driver was reporting in the cell being left, the departure won
and the car blinked. `flushIfDue` now filters `gone` per socket: a car that is still in this
hub, in a cell that subscriber also holds, is not reported gone to them. To anyone who does
not hold that cell it really has left, and they are still told.

`gone` therefore means "gone from your map", not "gone from this cell". That is the honest
meaning, and it is the one the client always assumed.

## Rejected alternatives

- **Order the hub's diffs so updates always precede departures.** Makes correctness depend on
  emission order across separate frames, which is the fragility that caused this. It also
  leaves `gone` meaning something the client has to compensate for.
- **Have the client defer a delete for a grace period.** Robust to ordering, but it trades a
  blink for a lag: a driver who really left lingers. The hub knows the answer exactly, so
  guessing on the client is the wrong end.
- **A `batch` marker so the client can apply a whole tick atomically.** Solves it, at the cost
  of a protocol concept and a buffering client, to work around a message that should not have
  been sent.
- **More unit tests on each side.** This is what was being done. Every one of these bugs was
  invisible from inside one half.
- **An end-to-end browser test.** The Playwright suite already runs two real cars
  (`e2e/two-cars.spec.ts`). It cannot make a hub hibernate, cannot control the clock, and
  takes minutes. This runs in 50 ms and can be run for a thousand ticks.

## Consequences

- The rig is where a protocol change is proved from now on. The finer interest cells and
  compact diffs that ADR-0029 exists to make possible are exactly the sort of change that
  breaks orderings, and they are cheap to test here and expensive to test anywhere else.
- The two invariants are stated once, for every driver, on every tick. New cases are a few
  lines in the drive rather than a new test file.
- A regression test is only worth what it fails on. Each case here was checked by
  reintroducing the original bug and confirming it fails — including the per-subscriber
  filter added by this decision.
- `flushIfDue` now builds one `gone` array per subscriber instead of sharing one per cell.
  The arrays are tiny and the number of messages is unchanged.
