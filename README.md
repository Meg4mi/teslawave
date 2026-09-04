# TeslaWave

See other Teslas around you on a live map, and wave at them. Free, no account, built to run
in the Tesla in-car browser while driving, and on a phone in a dash mount.

Independent project. Not affiliated with, endorsed or sponsored by Tesla, Inc.
TESLA is a trademark of Tesla, Inc.

## How it fits together

```
packages/protocol   wire types, geohash cells, fuzzing, interpolation, send rates
packages/hub-core   presence, per-cell diffs, waves, rate limits, counters (pure functions)
apps/worker         Cloudflare Worker + HubDO (WebSocket hibernation) + D1 + static assets
apps/web            Vite + React 19 SPA: MapLibre map, canvas car overlay, the wave
```

A driver's client fuzzes its position by 50-100 m, works out which geohash cells it is in,
and opens one WebSocket to the Durable Object that owns that region. The hub keeps presence
in memory, broadcasts a diff per cell at most every two seconds, and forgets anyone who
stops reporting for a minute. The client interpolates and dead-reckons between updates so
cars glide at 60 fps instead of jumping every two seconds.

Positions are never written to a database. Only wave counters are, and only when they change.

## Running it

```bash
pnpm install
pnpm --filter @teslawave/worker db:local   # apply D1 migrations locally, once
pnpm build                                 # the worker serves apps/web/dist
pnpm dev:worker                            # http://127.0.0.1:8787
```

For UI work with hot reload, `pnpm dev` runs Vite on :5173 and proxies `/api` to the worker.

An empty map is a bad way to build a social product, so there is a fleet of simulated drivers:

```bash
pnpm sim -- --n 20 --center 46.2044,6.1432 --radius 5000
```

`/kitchen-sink` (development only) renders every signature moment on demand: the boot sonar,
a wave sent, received and returned, the milestone card, and the whole sprite matrix.

## Checks

```bash
pnpm lint        # includes the cost invariants, see below
pnpm typecheck
pnpm test        # protocol, hub-core, worker (real WebSockets), web
pnpm test:e2e    # Playwright: car screen at both densities, and a phone
pnpm check:css   # no blur, no animated shadows, no hardcoded screen size
pnpm check:size  # under 400 kB gzipped, excluding MapLibre
```

## The cost invariants

The whole thing is meant to run on Cloudflare's free plan, where exceeding a limit causes an
error rather than a bill. That only holds while the hub stays eligible for hibernation. These
rules are enforced by ESLint on `apps/worker/src/**` and by tests, and they are not style:

1. No `setTimeout`, `setInterval` or alarms in the hub. The broadcast tick is driven by
   arriving messages.
2. Sockets are accepted with `ctx.acceptWebSocket()`, never `ws.accept()`.
3. No `fetch` and no D1 from a message handler.
4. Positions are never persisted; counter writes are debounced and limited to changed keys.
5. The hub id is validated at the edge, so at most 1,024 Durable Objects can ever exist.

Breaking (1) or (2) means every object with a connected driver is billed around the clock:
roughly $800 a month for a couple of hundred objects, and about $4,000 for one per user.
Rule (5) is what bounds that damage. `scripts/usage-report.mjs` checks yesterday's real
numbers against the free-tier limits every morning and shouts if duration looks like an
object that never went to sleep.

The numbers, the traffic model and the rejected alternatives are in
[docs/decisions/0002-hub-durable-object-and-cost-model.md](docs/decisions/0002-hub-durable-object-and-cost-model.md).

## Deploying

```bash
wrangler d1 create teslawave          # put the id in apps/worker/wrangler.jsonc
pnpm --filter @teslawave/worker db:remote
pnpm deploy
```

`WS_ENABLED=false` in the dashboard is a kill switch that needs no deploy. Preview URLs come
from Workers Builds on non-production branches, or `wrangler versions upload`.

## Documents

- [docs/decisions](docs/decisions) — one file per non-obvious decision, written as it was made
- [docs/privacy.md](docs/privacy.md) — what leaves the car, what is kept, and for how long
- [docs/tesla-notes.md](docs/tesla-notes.md) — findings from real cars, the only real data
- [docs/design-qa.md](docs/design-qa.md) — the checklist a release walks before it ships
