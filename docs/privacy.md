# Privacy

The design goal is that there is nothing to leak. No account, no email, no trip history.

## What leaves the car

| Data | Notes |
|---|---|
| Position | Blurred by 50-100 m **on the device**, before anything is sent. The exact position never leaves the browser. |
| Heading and speed | So other cars glide instead of jumping between updates. |
| Model and colour | Chosen by hand. No Tesla account, no Fleet API, no VIN. |
| Nickname | Optional, at most 16 characters. |
| A random id | Generated in the browser (`crypto.randomUUID`), stored in `localStorage`. Not linked to a person. |

The blur is a bounded random walk: one offset per page load, between 50 and 100 m, drifting
by at most 5 m per update. A fresh random offset each time would make cars twitch; a fixed
offset would preserve the exact shape of the trip and merely move it (ADR-0004).

## What is kept, and for how long

| Data | Where | Retention |
|---|---|---|
| Positions | Durable Object memory only | 60 seconds since the last update, then evicted |
| Wave counters | Durable Object storage, as numbers | Until reset; no timestamps, no places |
| Waves per map cell per day | D1, as numbers | 7 days |
| Pairing codes | D1 | 10 minutes, single use, then deleted |

Positions are never written to storage of any kind. That is enforced by a test, not by
intent: the hub's storage effects are asserted to contain only counter keys.

## Third parties

- **OpenFreeMap** serves the map tiles and therefore sees which tiles a browser requests.
- **Cloudflare** runs the app, and Cloudflare Web Analytics counts page views without
  cookies.
- Nothing else. No advertising, no tracking pixels, no cookie banner, because there are no
  cookies.

## Controls

- Sharing is off until you tap "Go".
- Invisible mode is one tap: your position is dropped from the hub immediately and you
  disappear from every other screen within about two seconds.
- Refusing location permission gives spectator mode: you can see other drivers, they cannot
  see you, and you are not counted as online.
- Clearing site data removes your identity and your wave count. There is no server-side
  account to delete because there is no account.
