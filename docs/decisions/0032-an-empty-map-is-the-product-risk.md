# 0032. Three answers to an empty map, none of which needs a new kind of data

Status: accepted
Date: 2026-09-07

## Context

The likeliest way this product dies is not a bug. It is a driver opening it on a Tuesday
evening, seeing a dark rectangle with one car on it, deciding the app has no users, and never
opening it again. That reading is wrong — it is a live map of a real region on a quiet
evening — and nothing on the screen distinguishes it from the reading that is right.

The brief anticipated this ("The map must never look dead", "Empty-state copy is honest and
inviting") and the app does what it said: the HUD says "Quiet road. 9 drivers online in the
area". But that line appears only *after* tapping Go. Before Go — which is the moment the
decision is made — the first screen is a car configurator over a map with nothing on it, and
it says nothing at all about whether anyone is out there.

Meanwhile the app already knows three things it never shows: how many drivers are online near
this position, which map cells have seen waves this week, and how many waves this driver has
exchanged. All three are already computed, already stored, and already free of anything that
could locate a person.

## Decision

Three answers, all from data that already exists.

**1. `/api/pulse` — counts, before joining.** Given a rough position it returns
`{ online, wavesToday }` summed over the cells a client would subscribe to, so the first
screen can say "9 drivers out there right now". Only ever shown when the number is above
zero: a landing page saying "0 drivers online" is worse than one that says nothing.

The cost is the design. This reaches a Durable Object, and Durable Object requests are the
binding free-tier constraint — about 60,000 of 100,000/day at launch volume (ADR-0002). A
landing page that spends one per visitor takes the app down on the day it gets shared widely,
which is the day it must not. So the answer is cached per cell rather than per visitor: every
driver in the same 39 × 20 km cell shares one lookup per minute. That turns "one request per
page load" into "one request per populated cell per minute", a number that does not move when
the page goes viral. The isolate memo is the part that always works; `Cache-Control` is for
when the custom domain is live, since the Cache API does nothing on a workers.dev subdomain.

**2. `/api/activity` — a faint tint on the cells that have seen waves this week.** Drawn under
the water and the roads, and only below zoom 12, where the cars are not legible anyway and the
brief's "cars are the only colour" is not in play. It comes straight from `daily_stats`, which
the nightly harvest already writes: waves per cell per day, no ids, no times, no positions, and
a cell is 39 × 20 km. The most it can ever say is "somebody waved somewhere in this box at some
point this week", which is exactly the honest thing a quiet map should say. Weighted against
the busiest cell in the answer rather than an absolute scale, because at launch the busiest
cell has single-digit waves and an absolute scale would render the whole map invisible for the
first year.

**3. A share card.** Your car and your wave count as one PNG, from the same drawing as the
sprite (ADR-0020). What travels in an owner group is a picture, not a link. Offered only from
"Around you", which is a sheet a driver opens deliberately, usually stopped — never from the
wave itself, which lasts two seconds and happens at speed.

## Rejected alternatives

- **Simulated cars on an empty map.** It would work, and it is a lie about who is on the road.
  The whole product is that the other cars are real.
- **A global "N drivers worldwide" counter.** Impressive and irrelevant: the question a driver
  is asking is whether anyone is near *them*, and the answer has to be local to be worth
  anything. It would also mean a global aggregate the geo-sharded design deliberately avoids.
- **A real heat map of where people drive.** Needs position history, which is the one thing
  this app promises never to keep (privacy.md, ADR-0002). Per-cell wave counts are what can be
  shown without becoming a different product.
- **A trip card at the end of a drive.** The stronger growth loop, and a v2 item for a reason
  (brief 9): it puts a route in an image people forward. The card here has no map on it.
- **A share button on the received-wave card.** The moment with the most feeling, and the worst
  possible moment to ask for it — that card is on screen for four seconds while someone is
  driving.
- **Spending a Durable Object request per landing-page view.** See above. The feature is worth
  having; it is not worth the app going dark on its best day.

## Consequences

- Two new public endpoints, both counts-only, both cached, neither reading anything the app
  did not already store. `privacy.md` gains a row for each.
- The pulse number is up to a minute stale, and up to ten minutes stale when the answer is
  "nobody". Asking a hibernated hub costs a reconstruction and a paged read of its storage to
  learn that nobody is there, and most regions are empty most of the time. An empty region does
  not become busy between one minute and the next: the first driver to arrive opens a socket,
  which wakes the hub anyway.
- The tint depends on the nightly cron having run. Before the first harvest it draws nothing,
  which is what the map did before this existed.
- The isolate memo is what bounds this in practice. `Cache-Control` only collapses requests at
  the edge once the custom domain is live, because the Cache API does nothing on a workers.dev
  subdomain — so until then the ceiling is one lookup per populated cell per isolate per minute,
  which is loose. If the landing page ever gets a large spike before the domain moves, watch
  `pnpm usage` for Durable Object requests.
- The share card is drawn on the client, so it costs no request at all — and on the car
  browser it very likely cannot be shared or saved. It is still drawn on screen there: the
  phone that paired to the car can send it properly.
- If the tint ever starts reading as a heat map of people rather than of waves, it should go.
  It is one fill layer and its removal costs nothing.
