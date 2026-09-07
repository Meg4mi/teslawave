# 0002. One hub Durable Object per geohash-2 region, and the cost invariants

Status: accepted
Date: 2026-09-04

## Context

Durable Objects are cheap when used correctly and ruinous when used carelessly. The numbers
below were read from Cloudflare's own pricing and limits pages on 2026-09-04.

| Resource (Workers Free) | Limit |
|---|---|
| Worker requests | 100,000 / day |
| Static asset requests | free and unlimited, outside the quota |
| Durable Object requests | 100,000 / day; **incoming WebSocket messages are billed 20:1**, outgoing are free |
| Durable Object duration | **13,000 GB-s / day** = 104,000 active-seconds at the billed 128 MB |
| Durable Object storage (SQLite, the only kind on Free) | 5 GB, 5M rows read/day, **100k rows written/day** |
| D1 | 5 GB, 5M rows read/day, 100k rows written/day |
| Workers KV | 100k reads/day but only **1,000 writes/day** |
| Durable Object classes | 100 (Free), object count unlimited |

Two facts shape everything:

1. **The Free plan cannot be charged.** "If you exceed any one of these limits, further
   operations of that type will fail with an error." The failure mode is an outage until
   00:00 UTC, never a bill. Cost risk begins only after an explicit upgrade.
2. **Duration is billed only while the object is running JavaScript or is idle but unable to
   hibernate.** Cloudflare: "Durable Objects that are idle and eligible for hibernation are
   not billed for duration, even before the runtime has hibernated them." An object becomes
   ineligible if it holds a `setTimeout`/`setInterval`, an in-flight `fetch()`, an active
   request, a socket accepted with `ws.accept()`, or an outbound connection.

An earlier draft of this decision claimed that one Durable Object per geohash-4 cell would
blow the duration budget. That was wrong: it is only true for a *timer-driven*
implementation. The correction matters, because it moves the argument from "which sharding
key" to "which invariants".

### Traffic model at launch

300 concurrent at peak, ~1,500 driver-hours/day:

| Per day | Fixed 5 s | Adaptive rate (avg ~8 s) |
|---|---|---|
| Position messages | 1.08M -> 54,000 request-equivalents | 0.68M -> 34,000 |
| Connections and reconnects | 6,000 | 6,000 |
| Waves | 250 | 250 |
| API calls (Worker quota) | 5,000 | 5,000 |
| **Durable Object requests** | **~60,000 of 100,000** | ~40,000 |
| Duration at 2 ms/message | ~290 GB-s (2%) | ~190 GB-s |
| Duration at Cloudflare's conservative 10 ms/message | ~1,350 GB-s (10%) | ~850 GB-s |

**Requests are the binding constraint, not duration.** Break-even is ~2,700 driver-hours/day
at a fixed 5 s rate and ~4,400 with the adaptive rate. Past that, `/ws` returns 429 until
midnight UTC. On Workers Paid ($5/month, 1M DO requests and 400k GB-s included) the same
design costs $5.00 at launch volume, $5.66 at 5,000 driver-hours/day, and about $10 at
30,000 driver-hours/day.

## Decision

**One Durable Object per geohash precision-2 region** ("hub"), with the brief's precision-4
cell logic inside it: per-cell subscription, per-cell diffs, per-cell counts, per-cell caps.
The whole launch geography (Geneva, Lausanne, Annecy, Lyon, Zurich, Milan, Paris) is inside
hub `u0`. `HUB_PRECISION` is a constant; 3 or 4 shards further with no other change.

And these **cost invariants**, enforced by ESLint (`apps/worker/src/**`) and by tests:

1. No `setTimeout`, `setInterval` or `setImmediate` in the hub. The 2 s broadcast tick is
   driven by arriving messages (`flushIfDue`), so an empty hub hibernates and costs nothing.
2. Sockets are accepted with `ctx.acceptWebSocket()`, never `ws.accept()`.
3. No alarms in the hub at all; the daily aggregation is a Worker cron.
4. No `fetch()` and no D1 from a message handler.
5. Positions are never written to storage. Only wave counters are, and only the keys that
   changed, at most once every 30 s.
6. The hub id is validated against `/^[0-9b-hjkmnp-z]{2}$/` at the edge, so at most 1,024
   Durable Objects can ever exist.

## Rejected alternatives

- **One Durable Object per geohash-4 cell** (the brief's design): equally cheap when the
  invariants hold, but a wave between two cars either side of a cell boundary needs
  object-to-object RPC to validate, drivers near a boundary need two or three sockets
  instead of one, and the number of always-on objects is 5-10x higher, which multiplies the
  cost of any future mistake.
- **One Durable Object per user or per session**: the worst possible multiplier for
  invariant 1 or 2 (see below).
- **Global broadcast object**: no geo-sharding, and one object becomes the whole capacity.

### What the invariants are actually worth

On Workers Paid, with a timer in the hub (or `ws.accept()`), every object with a connected
client is billed 24/7 at 10,800 GB-s/day:

| Shape | Monthly duration bill |
|---|---|
| 200 always-on cell objects | ~$805 |
| 1,000 always-on per-user objects | ~$4,050 |
| 1 always-on hub (this design) | 324k GB-s: inside the 400k included in the $5 plan |

That last row is the point of invariant 6. Even if invariant 1 is broken by a future change,
a bounded object count bounds the damage to roughly the price of the plan.

## Consequences

- Presence lives in memory only and is rebuilt by clients within one send interval after a
  hibernation wake. That is a feature: positions cannot leak from storage that never holds them.
  A wave inside that interval used to be refused as if the driver were hidden; ADR-0039 holds
  it and asks instead.
- A quiet region costs literally nothing.
- Growth past the free tier is a decision with a known price, not a surprise.
- A daily usage report (`scripts/usage-report.mjs`) checks actual Durable Object duration and
  requests against these numbers. If duration ever approaches 10,800 GB-s/day, an invariant
  has been broken: find it before anything else.

## Amendment, 2026-09-05: the daily harvest

The cell-day counters were meant to reach D1 through a daily aggregation, but nothing ever
called it: the hub accumulated one storage key per cell per day and one per driver ever seen,
and a restore listed at most ten thousand keys, after which counters would have silently
restarted from zero. Two changes, neither touching the invariants:

- The Worker cron calls `harvest()` on each hub as an RPC request, one per hub per day. The
  hub hands over the finished days, deletes them from its storage, forgets any driver who has
  not waved in 180 days (it now keeps the time of a driver's last wave, `wt:<id>`, for that),
  and the Worker writes the rows into D1. D1 stays out of the hub; the hub stays out of D1.
- The Worker writes each hub id into a `hubs` table the first time an isolate sees it, so the
  cron knows what to harvest. A namespace cannot be listed; at most 1,024 rows can exist.
- A restore lists storage in pages of a thousand rather than one capped call.
