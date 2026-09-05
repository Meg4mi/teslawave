# Privacy

The design goal is that there is nothing to leak. No account, no email, no trip history.

## What leaves the car

| Data | Notes |
|---|---|
| Position | The GPS fix as the device reports it, while you are visible. Drivers consent to this when they tap "Go"; it was blurred by 50-100 m until ADR-0024. |
| Heading and speed | So other cars glide instead of jumping between updates. |
| Model and colour | Chosen by hand. No Tesla account, no Fleet API, no VIN. |
| Nickname | Optional, at most 16 characters. |
| A random id | Generated in the browser (`crypto.randomUUID`), stored in `localStorage`. Not linked to a person. |

Positions are exact. What protects a driver is not blur but scope: a position is shown only
to drivers in the same map area, only while it is under 60 s old, and it is never written
anywhere (ADR-0024).

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
