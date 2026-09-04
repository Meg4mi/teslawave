# 0001. Stack: Cloudflare Workers and Durable Objects, Vite SPA, MapLibre on OpenFreeMap

Status: accepted
Date: 2026-09-04

## Context

TeslaWave must cost nothing to run beyond the domain, survive a few hundred concurrent
drivers, and stay smooth in the Tesla browser on an Intel Atom (MCU 2). A live map with
fan-out is the whole product, so the realtime primitive decides the stack.

## Decision

One Cloudflare account, one repo, one deploy:

| Layer | Choice |
|---|---|
| Realtime | Durable Objects with the WebSocket Hibernation API |
| API and hosting | Workers with static assets (SPA fallback) |
| Frontend | Vite + React 19 + TypeScript strict, TanStack Router |
| Map | MapLibre GL JS with OpenFreeMap vector tiles, custom dark style |
| Persistence | D1 (pairing codes, daily aggregates) |
| Identity | client-generated UUID in localStorage |
| Analytics | Cloudflare Web Analytics |

## Rejected alternatives

- **Supabase Realtime**: bills per message. Free tier is ~2M messages/month and 200
  concurrent. Position fan-out at 300 drivers is ~13M outbound messages a day. Wrong
  primitive for a free-forever live map.
- **Ably (6M messages/month), Pusher Sandbox (200k/day, 100 concurrent), Firebase RTDB
  Spark (100 concurrent)**: same shape of problem.
- **Next.js on Vercel**: SSR buys nothing for a single-screen realtime app, costs bundle
  size on MCU 2, and Vercel has no cheap stateful realtime story.
- **A free VM (Oracle Always Free)**: technically fine, but requires a card and ops work.

Cloudflare bills incoming WebSocket messages only (20:1), never outgoing, and hibernation
removes idle cost entirely.

## Consequences

Realtime is stateful and geo-sharded at the edge with no database in the hot path. The
failure mode of the free tier is an outage, not a bill (see 0002). The cost invariants that
keep it free are not optional; they are enforced by lint and tests.
