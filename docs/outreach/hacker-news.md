# Hacker News

Tier 7, and **gated on density existing somewhere**, because the map should not be empty for
the people who click. This audience is not drivers: it is the next contributor, and
credibility. Treat it as such and do not measure it in sign-ups.

One shot, and the front page is decided in the first hour. Post on a weekday morning US
time, then sit in the thread and answer everything.

## The post

**Title:** Show HN: A live map of the Teslas around you, running in the car's browser

**URL:** https://teslawave.app

## The first comment

Post this immediately, as the author.

> Author here. This is one page: your car on a live map, the cars around you beside it, and a
> button when one comes within 300 m — you wave, their screen says who waved and offers to
> wave back. No account, no install.
>
> The engineering constraints turned out to be the interesting part:
>
> **It has to be free to run, and fail closed rather than bill me.** It is a Cloudflare
> Worker with one Durable Object per region as the hub, and the whole design is arranged so
> the object stays eligible for hibernation: no timers, no alarms, no fetch and no database
> access from a message handler, sockets accepted through the hibernation API rather than
> `accept()`. Breaking any of those means every object with a connected driver is billed
> around the clock — roughly $800 a month for a couple of hundred objects. They are enforced
> by ESLint rules over the worker source and by tests, because a comment saying "do not add a
> setTimeout here" does not survive contact with a future me. The hub id is validated at the
> edge so at most 1,024 objects can ever exist, which bounds the damage if I am wrong.
>
> **The car is an Intel Atom (MCU 2) and the browser is old.** Positions arrive at most
> every two seconds; cars are interpolated and dead-reckoned between samples so they glide at
> 60 fps rather than jumping. The overlay recovers the map's affine transform once a frame
> from three projections instead of projecting a thousand points through the map library, and
> the whole thing steps down to 30 fps and a 1x map raster on its own when frames run long.
>
> **The wire had to shrink.** The first version put about 75 kB on every socket every two
> seconds at 500 drivers, which that CPU cannot parse. Drivers now get the cars within 12 km
> rather than everything in the cell, each described once and then referred to by a small
> handle: six numbers a tick instead of 210 bytes. Both wires are spoken at once so clients
> that have not reloaded keep working.
>
> **You cannot ship an update to a car.** A Tesla keeps a browser tab for weeks. The protocol
> carries a version, a newer hub answers with an upgrade message, and the client reloads
> itself the next time the car is standing still — never while moving.
>
> **Every real bug was between the two halves**, invisible from inside either. The hub and
> the client are both pure enough to run against each other on a virtual clock, with drops,
> hibernation wakes and cell crossings, checking invariants after every message rather than
> once a tick. That is where protocol changes get proved now.
>
> Positions are never written to a database: they live in memory for a minute and only wave
> counts are stored. Apache 2.0, and the decisions are written up one file at a time as they
> were made: github.com/Meg4mi/teslawave
>
> The honest limitation is that it needs two people who have it to cross paths, so on most
> roads today it is an empty map. Happy to answer anything.

## What the thread will ask

**"Why not a native app?"** No install and no store review is the entire onboarding
advantage, and the car has a browser and no app store. The cost is no push notifications and
no background execution, which this product does not need.

**"Privacy nightmare."** Meet it head on rather than defensively: it is opt-in per session,
nothing is persisted, parked cars hide themselves, invisible mode is immediate, and the
identity is a hash of a secret generated in the browser. The earlier version fuzzed positions
by 50–100 m and it was removed, because with consent and no storage the blur protected nobody
and made the map wrong. That is written up as ADR-0024.

**"This will not scale."** Correct, past a point, and deliberately: the free tier is the
constraint the design serves, and the kill switch is a dashboard variable that needs no
deploy.

**"Distracted driving."** The app says the road comes first before you start, the wave is one
large button, and where the law says a screen is not touched while moving, it is not.
