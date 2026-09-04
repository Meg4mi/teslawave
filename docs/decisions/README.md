# Decision store

One file per non-obvious decision, written in the same commit as the decision itself, never
afterwards. Numbered, append-only: superseded decisions are marked, not deleted.

Format: Context / Decision / Rejected alternatives / Consequences (`0000-template.md`).

| # | Decision |
|---|---|
| [0001](0001-stack.md) | Cloudflare Workers + Durable Objects, Vite SPA, MapLibre on OpenFreeMap |
| [0002](0002-hub-durable-object-and-cost-model.md) | One hub Durable Object per geohash-2 region, and the cost invariants |
| [0003](0003-d1-not-kv.md) | D1 for the little persistence there is, never Workers KV |
| [0004](0004-fuzz-random-walk.md) | Position fuzzing as a bounded random walk |
| [0005](0005-canvas-overlay.md) | Cars drawn on one 2D canvas above MapLibre |
| [0006](0006-map-style.md) | Custom near-monochrome style on OpenFreeMap tiles |
| [0007](0007-wave-semantics.md) | Wave semantics: both parties, 150/300 m, milestones instead of leaderboards |
| [0008](0008-pairing-in-d1.md) | Pairing codes in D1 rather than a pairing Durable Object |
| [0009](0009-adaptive-send-rate.md) | Adaptive position send rate |
| [0010](0010-no-service-worker.md) | No service worker in v1 |
| [0011](0011-client-state.md) | Zustand plus code-based TanStack routes |
| [0012](0012-own-car-raw-fix.md) | Own car drawn from the raw local fix, others from fuzzed data |
| [0013](0013-hub-core-pure-module.md) | Hub logic as a pure, portable module |
| [0014](0014-design-without-blur.md) | Pre-baked pixels instead of blur and backdrop-filter |
| [0016](0016-snap-other-cars-to-roads.md) | Other cars are drawn on the road they are plausibly on |
| [0017](0017-camera-yields-to-touch.md) | The camera yields to the driver's hands |
