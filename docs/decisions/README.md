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
| [0007](0007-wave-semantics.md) | Wave semantics: both parties, 300/450 m (was 150/300), milestones instead of leaderboards |
| [0008](0008-pairing-in-d1.md) | Pairing codes in D1 rather than a pairing Durable Object |
| [0009](0009-adaptive-send-rate.md) | Adaptive position send rate |
| [0010](0010-no-service-worker.md) | No service worker in v1 |
| [0011](0011-client-state.md) | Zustand plus code-based TanStack routes |
| [0012](0012-own-car-raw-fix.md) | Own car drawn from the raw local fix, others from fuzzed data |
| [0013](0013-hub-core-pure-module.md) | Hub logic as a pure, portable module |
| [0014](0014-design-without-blur.md) | Pre-baked pixels instead of blur and backdrop-filter |
| [0016](0016-snap-other-cars-to-roads.md) | Other cars are drawn on the road they are plausibly on |
| [0017](0017-camera-yields-to-touch.md) | The camera yields to the driver's hands |
| [0018](0018-traced-model-art.md) | Each model is traced, not parameterised |
| [0019](0019-own-car-is-interpolated-too.md) | Your own car is interpolated too, and the camera pauses on touch-down |
| [0020](0020-one-car-drawing-two-renderers.md) | One car drawing, rendered as SVG in the UI and baked to bitmap on the map |
| [0021](0021-map-resolution-follows-the-frame-rate.md) | The map's resolution follows the measured frame rate, and the overlay projects for itself |
| [0022](0022-the-wave-is-an-event-on-the-whole-screen.md) | The wave is an event on the whole screen, not a ripple on one sprite |
| [0023](0023-one-catalogue-per-language.md) | One catalogue per language, with grammar inside it, and the language detected not asked |
| [0024](0024-exact-positions.md) | Positions are sent exactly, and drawn exactly where they were sent |
| [0025](0025-identity-is-a-hashed-secret.md) | A driver's id is the hash of a secret only their browser holds |
| [0026](0026-a-parked-car-is-hidden.md) | A car parked for ten minutes is hidden until it moves |
| [0027](0027-performance-beacon.md) | An opt-in, anonymous performance beacon from real screens |
