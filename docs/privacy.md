# Privacy

The design goal is that there is nothing to leak. No account, no email, no trip history.

## What leaves the car

| Data | Notes |
|---|---|
| Position | The GPS fix as the device reports it, while you are visible and moving. A car parked for ten minutes is hidden until it moves again (ADR-0026). Drivers consent to this when they tap "Go"; it was blurred by 50-100 m until ADR-0024. |
| Heading and speed | So other cars glide instead of jumping between updates. |
| Model and colour | Chosen by hand. No Tesla account, no Fleet API, no VIN. |
| Nickname | Optional, at most 16 characters. |
| A random secret | Generated in the browser (`crypto.randomUUID`), stored in `localStorage`. The hub hashes it into the id other drivers see; the secret itself is never shown or stored server-side, so an id read off the wire cannot be used to pose as its driver (ADR-0025). |

Positions are exact. What protects a driver is not blur but scope: a position is shown only
to drivers within 12 km, only while it is under 60 s old, and it is never written anywhere
(ADR-0024, ADR-0033). It used to be shown to everyone in the same 27 x 20 km map cell; the
narrower scope came out of making the app affordable in a city, and is a privacy improvement
by consequence rather than by design.

On the wire a position is rounded to about 1.1 m, an order of magnitude finer than a GPS fix.
That is to save bytes, not to obscure anything: there is no offset and no direction to it, and
a wave is still validated against the exact position the device reported.

## What is kept, and for how long

| Data | Where | Retention |
|---|---|---|
| Positions | Durable Object memory only | 60 seconds since the last update, then evicted |
| Wave counters | Durable Object storage, as numbers | Until 180 days after that driver's last wave. The time of the last wave is kept for that purpose; no places |
| Waves per map cell per day | Durable Object storage for the current day, then D1 | Rolled into D1 by a daily job; 7 days |
| Pairing codes | D1 | 10 minutes, single use; the row (which carries the secret) is deleted the moment it is claimed |
| Performance samples, only from drivers who turned "Share performance data" on | D1 | 30 days. Screen density and size, browser version, frame timings, whether the fallbacks engaged, how many cars were on the map. No position, no id, no nickname (ADR-0027) |

Positions are never written to storage of any kind. That is enforced by a test, not by
intent: the hub's storage effects are asserted to contain only counter keys.

## What is published

Two endpoints answer questions about a region without anyone connecting. Neither reads
anything that is not already listed above, and neither can say anything about a person
(ADR-0032).

| Endpoint | Answers | From |
|---|---|---|
| `/api/pulse?lat=&lng=` | How many drivers are online near a point, and how many waves in their cells today | The hub's in-memory counts. Two numbers; no ids, no positions. Cached per map cell, so the answer is about a 39 x 20 km box and never about a request |
| `/api/activity` | Waves per map cell over the retained week | The `daily_stats` rows already written by the nightly job. No ids, no times, no positions |

Both exist so a driver can see whether anyone is out there before deciding to be seen. The
finest thing either can say is "somebody waved somewhere in this 39 x 20 km box, some time
this week".

The share card ("Around you" -> "Share your card") is drawn in your browser and sent nowhere.
It carries your car, your wave count and the domain: no map, no route, no place, no time, and
nothing about the drivers you waved at.

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
- A car that has not moved for ten minutes is hidden the same way, without a tap, and comes
  back the moment it moves. Where you stop is not something the map shows.
- Refusing location permission gives spectator mode: you can see other drivers, they cannot
  see you, and you are not counted as online.
- Clearing site data removes your identity and your wave count. There is no server-side
  account to delete because there is no account.
