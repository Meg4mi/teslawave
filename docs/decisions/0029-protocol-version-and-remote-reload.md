# 0029. The wire format has a version, and an old build replaces itself at a standstill

Status: accepted
Date: 2026-09-07

## Context

A Tesla is pinned to a tab. Not for an afternoon: for weeks, across firmware updates, in a
car that is parked more than it is driven. Whatever build was loaded the first time is the
build that is still running, and nothing in the app could change that.

ADR-0010 refused a service worker for exactly this reason — "the failure mode is a Tesla
pinned to a tab, running a build from three weeks ago, talking a protocol the hub has moved
past" — and closed by saying the answer is "a version handshake that can force a reload".
That handshake was never built, so the situation ADR-0010 was afraid of was the situation we
were already in: the wire format was frozen by the oldest tab in the fleet, and the only
recovery was asking an owner to clear site data on a car screen.

Two things make this urgent rather than tidy. The protocol is about to change (finer
interest cells, compact diffs, a public pulse endpoint), and the app is live, so every day
of delay adds tabs that can never be told anything.

## Decision

**A version on the wire, and a reload the client schedules for itself.**

- `PROTOCOL_VERSION` is a constant in the protocol package. The client puts it in `hello`.
- A `hello` with no `v` is read as `LEGACY_PROTOCOL_VERSION` (0), not rejected: every client
  deployed before this decision sends no version, and they must keep working.
- A hub whose version is newer answers with `{ t: 'upgrade', v }`, **after** the welcome and
  the opening counters. It does not close the socket and does not refuse anything: an old
  client keeps its map, its presence, its waves.
- The client reloads itself when it next reads a speed below `STATIONARY_SPEED_KMH`. A
  spectator, or a tab with no fix at all, counts as stopped.
- At most one reload per version per tab, recorded in `sessionStorage`.
- While the reload is pending, one line at the foot of the screen says so.

A client whose version is *newer* than the hub's is left alone. That is the hub being
behind, which a deploy fixes without anyone reloading anything.

## Rejected alternatives

- **Close the socket on an old client.** The simplest thing that forces the issue, and the
  worst: it takes the map away from a driver at 120 km/h, and it does so at the exact moment
  a deploy goes out, to every car at once.
- **Reload immediately on `upgrade`.** Same objection, one step softer. A reload blanks the
  screen for a second or two. The moment when that is free is a standstill, and every drive
  reaches one within minutes.
- **A service worker that swaps the bundle underneath.** Still the thing ADR-0010 rejected,
  and it does not solve the protocol question: the version the hub cares about is the one the
  running JavaScript speaks, not the one on disk.
- **Version in the URL, and a cache-busting query.** Moves the problem to whatever pinned the
  tab. Owners pin `teslawave.app`, not a versioned URL.
- **No session mark, just reload whenever asked.** An edge still serving the old bundle, or a
  browser cache that outlived the deploy, would then reload the car every few seconds for the
  whole drive. The mark makes the failure "one wasted reload", not "the app is unusable".

## Consequences

- The wire format can change. That is the point: finer interest cells and compact diffs
  (both needed before a dense city hits the per-cell socket cap) are now possible without
  stranding the fleet.
- Bump `PROTOCOL_VERSION` when a change would make an old client and a new hub disagree: a
  field either side relies on, a changed meaning, a removed message. Adding a field an old
  client can ignore is not a bump.
- A driver on an old build sees one extra line of copy and, at their next red light, a
  one-second reload. Nothing else about the drive changes.
- ADR-0010 can be revisited now. A service worker's real risk was the un-recallable build,
  and the recall now exists — though the bundle budget still makes the case thin.
