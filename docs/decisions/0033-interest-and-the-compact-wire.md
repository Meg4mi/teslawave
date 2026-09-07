# 0033. A driver is sent the cars near them, by handle, not every car in the cell in full

Status: accepted
Date: 2026-09-07

## Context

The per-cell socket cap was 500, and it read like a capacity limit. It was not. It was a
fan-out limit wearing a capacity limit's clothes, and the real ceiling was far below it.

Every subscriber to a cell was sent every car in that cell, as a whole `CarState`, every two
seconds. A `CarState` is about 210 bytes, most of it saying things that never change — a
32-character id, a model, a colour, a nickname, a join timestamp — and the id alone is 34 of
them. So the cost of a tick was the square of the population, in both directions at once:
the hub building it, and every car in the city parsing it.

Measured (`pnpm bench`, one tick, every driver in one cell within range of every other,
serialising included because the Durable Object pays it once per socket):

| drivers | old wire | per socket, every 2 s |
|---|---|---|
| 200 | 29 ms, 6.0 MB | 30.9 kB |
| 500 | 167 ms, 36.7 MB | 75.2 kB |
| 1,000 | 844 ms, 145.2 MB | 148.7 kB |

At the stated cap of 500 the hub spent a sixth of every tick in one thread and put 75 kB on
every socket every two seconds. An Intel Atom — the performance budget the whole app is built
around (brief 2.2) — cannot parse that and hold 25 fps. The usable number was a fraction of
the advertised one, and nothing said so.

Geneva will never reach it. Paris or Milan will, if the product works, and the failure would
arrive as "the app is slow in cities" rather than as an error.

The wire format was frozen by the oldest tab in the fleet until ADR-0029 built the version
handshake. This is the change that handshake exists for, and it is the first thing through it.

## Decision

**A driver is sent the cars near them**, not every car in a 27 × 20 km cell.

Interest is measured from the position the hub already keeps for the implied-speed check —
nothing new is stored. `INTEREST_RADIUS_M` is 12 km, comfortably outside the furthest claim
the interface makes ("within 10 km"), so the counts stay exact. A car already on your map is
kept until it is 13.5 km out, because a single threshold makes a car at the edge blink in and
out every couple of seconds — ADR-0031's bug, arrived at from a different direction.

A spectator or an invisible driver sends no positions, so there is nothing to measure from,
and they are served their subscribed cells entire, exactly as everyone was before. They are a
small minority and they are not what creates the fan-out.

**And a car is described once, then referred to by a handle.** `CarMeta` carries the static
facts and a small integer; every tick after that is a positional tuple,
`[handle, lat, lng, heading, speed, waves, age]`, with no keys and no repetition. Coordinates
are integers at 1e5 of a degree — about 1.1 m, an order of magnitude under a good GPS fix.
That is quantisation for bytes, not the fuzzing ADR-0024 removed: there is no offset and no
direction to it, and a wave is still validated against the exact position the client sent.

The result, same fixture:

| drivers | compact wire | per socket, every 2 s |
|---|---|---|
| 200 | 10 ms, 0.8 MB | 4.6 kB |
| 500 | 29 ms, 4.8 MB | 11.3 kB |
| 1,000 | 117 ms, 18.5 MB | 22.3 kB |
| 2,000 | 460 ms, 74.4 MB | 45.0 kB |

**So the cap is 1,000, set from that table.** 1,000 costs 117 ms of a 2,000 ms tick and 22 kB
a socket, which a car can afford. 2,000 costs a quarter of the tick and twice the JSON, which
it cannot. The number is now one the app can actually reach, which the old 500 never was.

**Both wires are spoken at once.** A connection that has not reloaded into the new build still
gets whole car states and keeps working, which is precisely the promise ADR-0029 made when it
chose to tell an old client rather than cut it off. `wholeDiff` is the price of that promise
and can be deleted once the fleet has turned over; nothing else depends on it.

Three things fell out of the work and are part of it:

- **A per-cell index over presence.** Counting a cell and building its diff were both a scan
  of every driver in the hub. Both are now a set lookup.
- **Everything that does not vary by reader is computed once per flush.** The handle and the
  six numbers describing where a car is are the same for everyone who can see it; building
  them inside the per-subscriber loop meant a thousand drivers allocated a million tuples a
  tick to send a thousand distinct ones. This alone was 473 ms → 53 ms before serialising.
- **The interest test is flat-earth and squared.** It runs a million times a tick in a dense
  city, so a cosine and a square root inside it are paid a million times. Over 12 km the error
  against haversine is centimetres, and it is a soft threshold with a hysteresis band around
  it. Where exactness decides something — a wave accepted or refused — haversine still does it.

## Rejected alternatives

- **Finer subscription cells** (precision 5 instead of 4), which is how this was first framed.
  It moves the same problem: a 10 km interest radius needs a 5 × 5 grid of 4.9 km cells, which
  is 25 subscriptions against a protocol that allows 4, and it changes sharding, counting and
  the daily harvest along the way. Filtering by distance is exact, has no boundary artefacts,
  and touches none of that.
- **Capping the number of cars per subscriber**, nearest first. Bounds the payload harder, and
  breaks the "within 10 km" count, which would then have to be sent as a separate number the
  client trusts instead of one it can see. Not needed while the interest radius is wider than
  anything the interface claims.
- **Binary framing** (a typed array, or something like MessagePack). Another 2-3× on top, and
  it makes every frame unreadable in a browser's network panel — which is how most of the bugs
  in `docs/tesla-notes.md` were actually found. Revisit if the byte count ever binds again.
- **Sending only what changed per field.** More state on both sides to save a few bytes on
  fields that change every tick anyway. The repetition worth removing was the static half, and
  the handle removes all of it.
- **Raising the cap without changing the wire.** The cap was never the constraint.

## Consequences

- `PROTOCOL_VERSION` is 2. Old clients get `upgrade` and reload at their next standstill
  (ADR-0029), and are spoken to in the old shape until they do.
- A handle is a compression, never an identity. It is per hub and per connection, reassigned
  freely, and released when the driver leaves. A driver's id is still the hash of a secret only
  their browser holds (ADR-0025).
- The client keys handles by hub, because two hubs will use the same small integers for
  different drivers. The hub a car arrived on is now also how a wave is routed to it, which is
  more reliable than the cell it was last said to be in.
- `pnpm bench` reproduces the table. Re-run it after touching `flushIfDue`; the caps are
  derived from it, and a change that makes the tick quadratic again will show up there and
  nowhere else in CI.
- Past 1,000 in one cell the lever is `HUB_PRECISION`, not this cap: 3 gives 32,768 possible
  objects instead of 1,024 and divides a city between several of them. Per-tick cost is per
  object, so that is what buys the next order of magnitude.

## Amendment, 2026-09-07: what a client lets go of, and what a hub keeps holding

Two pieces of bookkeeping on this wire were wrong, and together they took cars off the map
mid-drive. When the set of cells around a driver changed on a hub they were still connected
to, the client forgot every handle that hub had ever given it, not only the ones for the cells
it dropped: every car still held went deaf to its own updates, dead-reckoned along its last
heading, and expired a minute later, while only a car newly in range moved again. And a car
was deleted by the cell it had been *described* in, which the wire never restates: a companion
driven twenty kilometres since was deleted the moment the cell they were met in fell out of
range behind. A wave in flight at that moment lost the car it was drawn on.

The client now keeps a car's cell from the positions it is sent, drops on that, and forgets
only the handles of the cars it dropped. The hub, for its part, no longer counts a car as held
by a connection once that connection has let go of the car's cell: it would otherwise have
sent six numbers for a handle the client had rightly forgotten when the car later drove into
a cell the connection did hold, and the car never reappeared. The round-trip suite drives
both cases against the real hub.
