# TeslaWave — Project brief for Claude Code

> Read this fully before producing a plan. Do not implement anything until the plan has been reviewed and approved.
> Plan with the strongest model available; implementation will be delegated to a lighter model afterwards.

## 1. What we are building

A free, browser-based app that lets Tesla drivers **see other Teslas around them on a live map and wave at them**, running primarily in the **Tesla in-car browser** while driving, and secondarily on a phone.

It is a **community product**, not a traffic tool. The feeling is the Tesla wave (the nod between two owners), turned into an app: warm, playful, a little proud, never corporate. It sits next to Tesla's built-in nav on the car screen; it does not replace it.

Domain: `teslawave.app` (primary). Product name in copy: **TeslaWave**. The brand string must live in a single config file so a rebrand is a one-file change.

Independent project. Footer on every page: *"Independent project. Not affiliated with, endorsed or sponsored by Tesla, Inc. TESLA is a trademark of Tesla, Inc."* Never use the Tesla logo, wordmark styling, or the "T" mark.

## 2. Non-negotiable constraints

1. **Zero recurring cost at launch.** The only paid item is the domain. Every service must be on a free tier that survives a few hundred concurrent drivers without a credit card. No service that bills per message, per connection, or per request at our expected volume.
2. **Runs in the Tesla browser while driving.** Chromium 148 (firmware 2026.26+), landscape 17" screen, touch only, hostile on-screen keyboard. Two hardware tiers: MCU 3 (AMD Ryzen, 2021+) is fast; **MCU 2 (Intel Atom, 2018–2021) is the performance budget** — the app must be smooth there.
3. **Privacy by design.** Sharing is opt-in, and the consent screen says exactly what leaves the car. Positions are sent as the device reports them (they were fuzzed by 50–100 m until ADR-0024, which made every other car look offset), never persisted server-side, shown only to drivers in the same map area, and expire after 60 s without an update. One-tap invisible mode. No trip history in v1.
4. **No Tesla API in v1.** No Tesla login, no Fleet API, no telemetry. Identity is anonymous; the user picks model and colour manually. (Tesla OAuth "verified owner" badge is a v2 item — see §9.)
5. **Instant onboarding.** No account, no email, no waitlist. Open the URL, pick your car, tap "Go", you're on the map in under 20 seconds. Phone-to-car pairing via QR/short code so the driver never types on the car screen.

## 3. Stack decision (challenged, then chosen)

Default stack (Next.js + Supabase + Vercel) was evaluated and rejected for the realtime core:

- **Supabase Realtime** bills by messages (free tier ≈ 2M/month, 200 concurrent). Position broadcast with fan-out burns that in hours of real use. Wrong primitive for a "free forever" live map.
- **Next.js** is heavier than needed for a single-screen realtime app that must run on an Intel Atom. SSR buys nothing here except the landing page, which can be static.
- **Vercel** is fine for static but has no cheap stateful realtime story.

Chosen stack — one Cloudflare account, one repo, one deploy:

| Layer | Choice | Why |
|---|---|---|
| Realtime core | **Cloudflare Durable Objects**, one DO per geohash cell (precision 4 ≈ 20×40 km), WebSockets with **hibernation** | Stateful, geo-sharded, edge-located, free tier; hibernated WebSocket messages are billed at a fraction of a request. In-memory presence, no database in the hot path. |
| API / static hosting | **Cloudflare Workers** with static assets (Pages-style) | Same deploy as the DOs, no cold starts, free. |
| Frontend | **Vite + React 19 + TypeScript strict**, SPA, TanStack Router | Small bundle, fast on MCU 2, no framework overhead. Landing page is a static route with full meta/OG. |
| Map | **MapLibre GL JS** + **OpenFreeMap** vector tiles (no key, no cost) with a custom dark style | Custom style is where the "wow" lives. Migration path to self-hosted Protomaps PMTiles on R2 if OpenFreeMap ever limits. |
| Persistence (tiny) | **Cloudflare D1** (SQLite) or **KV** | Only for: pairing codes (short TTL), aggregate counters (waves per region/day), and an optional garage profile keyed by a client-generated id. |
| Identity | Client-generated UUID in `localStorage`, exported to the phone via pairing | No auth system in v1. |
| Analytics | Cloudflare Web Analytics | Free, privacy-friendly, no cookie banner. |

Explicitly **not** used in v1: Supabase, Vercel, Next.js, Mapbox, PostHog, any paid tile provider, Tesla Fleet API.

If, during planning, a strong reason emerges to deviate (e.g. a DO free-tier limit that is lower than assumed), surface it as a decision with numbers rather than silently switching.

## 4. Product scope — v1 (the whole of it)

### 4.1 Onboarding (`/`)
- Landing + app are the same route. Page `<title>`: *"Wave at other Teslas on the road — live map from your Tesla screen"* (search phrase, not brand).
- First visit: pick **model** (3, Y, S, X, Cybertruck), pick **colour** (the real Tesla palette: Pearl White, Solid Black, Midnight Silver, Deep Blue, Red, Ultra Red, Stealth Grey, Quicksilver, Diamond Black…), optional **nickname**. Tap **Go**.
- Sharing toggle defaults **on** after that explicit tap; invisible mode is one tap in the corner.

### 4.2 Live map
- Full-screen, dark, near-monochrome custom style; the cars are the only colour on screen.
- Your car centred, heading-up ("Track") by default; north-up toggle.
- Other cars rendered as **top-down sprites of the actual model in the actual colour**, rotated to heading, with a subtle glow.
- **Smooth motion**: server updates every 5 s, client interpolates + dead-reckons (heading, speed) at 60 fps so cars glide, never teleport.
- Faint **trail** of the last ~30 s per car, fading out.
- Ambient counters, always visible, small: *"14 online · 3 within 10 km · last wave 2 min ago"*. The map must never look dead.

### 4.3 The wave
- When another car comes within ~150 m, both screens get a soft pulse on that car and a single large **Wave** button appears for ~10 s.
- Tapping sends a wave; the other side sees a ripple animation on your car and hears a short chime (browser audio keeps playing while driving in the Tesla browser; keep it under 300 ms, and offer a mute).
- Waves increment a per-user counter (shown on the car card) and a regional aggregate. No leaderboards, no ranking.

### 4.4 Car card
- Tap any car: nickname, model, colour, wave count, "online for 23 min". Wave from here too. Nothing else.

### 4.5 Phone pairing
- On the phone: after onboarding, "Show on my Tesla" → 6-character code + QR. On the car: open `teslawave.app`, tap "I have a code", enter it (big keys, uppercase only, no ambiguous chars) → car adopts the same identity. Code TTL 10 min, single use.

### 4.6 Regional pulse
- A tiny sheet showing live online count for the driver's region (derived from geohash, not from a database of regions) and today's wave count.

Out of scope for v1 (do not plan them, do not leave hooks that cost time): trip cards, garage profiles beyond nickname, meetups/convoys, Supercharger check-ins, "we crossed before", Tesla login, payments, trip history, push notifications, native apps.

## 5. Realtime design (the core — plan this carefully)

- Client computes geohash(precision 4) of its position and opens **one WebSocket to that cell's DO**. Near a cell edge it also subscribes to the adjacent cell(s) it is within 10 km of — max 3 sockets.
- Client sends `{lat, lng, heading, speed}` every 5 s (or when heading changes > 20°), exactly as the device reports it. The server holds it in memory only and never writes it anywhere.
- DO keeps an in-memory map `id → {lat,lng,heading,speed,model,colour,nick,ts}`, broadcasts diffs to all sockets in the cell at most every 2 s, and evicts entries older than 60 s.
- Use WebSocket **hibernation** API so idle cells cost nothing. Wake-up restores from DO storage only the aggregate counters, never positions.
- Waves: client → DO `{to}`; DO validates proximity from its own state (< 300 m, both online) then forwards to the target socket and increments counters. Counters are periodically flushed to D1/KV.
- Region counts: each DO exposes its online count; the client's "region" count is the sum over the subscribed cells. No global query.
- Back-pressure and abuse: rate-limit per socket (1 position / 2 s, 1 wave / 5 s), drop messages with impossible speeds (> 250 km/h between updates), cap 500 sockets per cell.

Document the message protocol as TypeScript types shared between client and worker.

## 6. Tesla-browser acceptance criteria

- Runs and stays interactive on a 2019 Model 3 (MCU 2): steady ≥ 25 fps panning with 20 cars visible; initial load < 3 s on LTE; JS bundle < 400 kB gzipped excluding MapLibre.
- No CSS `filter`, `backdrop-filter`, box-shadow animation, or large blur; animate only `transform`/`opacity`; MapLibre with minimal layers, no 3D terrain, no buildings, no labels below zoom 12.
- Layout uses viewport units and `devicePixelRatio`; **never hardcode the screen size or scale** (2026.26 changed the browser's pixel density and broke apps that did).
- All touch targets ≥ 64 px on the car screen; nothing important within 40 px of the screen edges.
- Works with `Geolocation.watchPosition` at ~1 Hz; degrades gracefully if permission is denied (spectator mode: see, can't be seen or wave).
- Survives tab pinning / reload without losing identity (localStorage), and survives WebSocket drops with silent reconnect + exponential backoff.
- Also fully usable on a phone in a dash mount (portrait), same build.

## 7. Design direction

- Tesla-native restraint: deep neutrals, one accent, mono numerals for counters, generous whitespace, no emoji in UI chrome.
- Motion is the personality: gliding cars, wave ripples, the pulse. Motion is subtle at speed and never blocks the map.
- Copy speaks like an owner: *"You're passing a blue Model Y."* — short, warm, no exclamation marks, no lecturing.
- Empty-state copy is honest and inviting: *"Quiet road. 9 drivers online in Romandie — say hi when you cross one."*

## 8. Engineering conventions

- TypeScript strict everywhere (client and worker), functional patterns, no classes except the DO itself.
- Conventional commits. Small PR-sized steps in the plan, each independently verifiable.
- Monorepo layout: `apps/web` (Vite), `apps/worker` (Workers + DOs), `packages/protocol` (shared types + geohash utils). pnpm workspaces.
- Tests: protocol/geohash/interpolation as unit tests (Vitest); DO logic with Miniflare/`wrangler dev` integration tests; one Playwright smoke test at a 1920×1200 viewport emulating the car.
- Wrangler config committed; deploy = `wrangler deploy`. Preview deploys on branches.
- Record every non-obvious decision (and the rejected alternative) in the project's decision store as it is made, not at the end.

## 9. Roadmap after v1 (context only, do not plan)

- Tesla OAuth → "verified owner" badge and auto-filled model/colour (Fleet API, read-only, no telemetry, no polling).
- Trip card at end of drive (shareable image) — the growth loop for owner groups.
- Garage profiles, "we crossed before", meetups/convoys, Supercharger check-ins.
- Paid tier only for things that don't reduce the network: history, stats, cosmetics, always-on telemetry mode. Never charge to see or be seen.
- Launch geography: Geneva – Annecy – Lausanne first, seeded through Romandie / Haute-Savoie owner groups.

## 10. What the plan must contain

1. Confirmation (with numbers) that the Cloudflare free tier covers ~300 concurrent drivers at the protocol rates above, or a proposed change.
2. Repo scaffold and tooling.
3. Protocol package: types, geohash cell + neighbour logic, interpolation.
4. Worker + DO: presence, broadcast, waves, hibernation, rate limits, counters.
5. Web app: onboarding, map + custom style, car sprites, motion, wave UX, pairing, counters, invisible mode.
6. Tesla-browser performance work and the acceptance-criteria test setup.
7. Deploy, domain, analytics, footer disclaimer, OG/meta.

Order the steps so that a working "two browsers see each other move on the map" exists as early as possible; polish comes after that milestone, not before.
