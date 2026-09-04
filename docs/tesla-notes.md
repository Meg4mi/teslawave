# Notes from real cars

The only performance data that actually counts. CI has no GPU, so its numbers say nothing
about MCU 2 (see `apps/web/e2e/perf.spec.ts` for why the CI gate measures our own per-frame
work instead of composite frame rate).

Add a row per session. Keep the failures: they are the useful part.

Live at **https://teslawave.meg4mi.workers.dev** — open that on the car screen.

| Date | Car / firmware | What was tested | Result |
|---|---|---|---|
| 2026-09-04 | none (CI container) | first deploy | Worker, Durable Object, D1 and cron live; seven smoke checks green, including a real WebSocket welcomed by the hub |
| 2026-09-04 | Tesla car screen (photo) | live map, wave toast, counters | two bugs, both fixed: the "waved at you" toast never disappeared, and the online counts drifted as the connection came and went. See below. |
| _pending_ | 2019 Model 3, MCU 2 | first load, map, own car moving | not yet run on a car |
| _pending_ | 2022 Model Y, MCU 3 | same | not yet run on a car |

## What to record

- **Cold load time** on LTE, from typing the URL to seeing your own car. Target: under 3 s.
- **Frame rate** while panning with about 20 cars visible. Target: 25 fps or better. The app
  drops the overlay to 30 fps and thins trails on its own when frames run long, so note
  whether that kicked in.
- **Geolocation**: does `watchPosition` update at roughly 1 Hz while driving? Does the
  permission prompt appear at all? If it does not work on some firmware, spectator mode is
  the fallback and that needs saying here.
- **Pixel density**: 2026.26 changed it. Note `devicePixelRatio` and whether anything looked
  the wrong size. Nothing in the app may assume a value.
- **Audio**: does the chime play while the car is moving? Is it audible over road noise at
  motorway speed without being startling?
- **Touch**: is the wave button hittable with a glance rather than a look?
- Anything that felt wrong, even if you cannot measure it.


## 2026-09-04 — two bugs found on a real car screen

**The toast that would not leave.** The dismiss timers lived in an effect that depended on the
`onDone` prop. The app passes an inline arrow, so it is a new function on every render, and the
map re-renders about twice a second — the timers were cleared and restarted forever and the
toast sat on screen for the rest of the drive. Fixed in `ui/primitives/index.tsx`: the effect
now depends on the toast's id and nothing else, and the callback is held in a ref.
`ui/primitives/toast.test.tsx` re-renders the parent ten times across the toast's lifetime and
fails against the old code.

**Online counts that only ever grew.** Three separate causes, all visible as "N online" being
wrong after a tunnel or a spell with the tab in the background:

1. `cellStats` accumulated every cell it had ever seen. Driving across cells added their counts
   and never removed them. Counts are now summed over the cells we currently hold a socket for,
   and the net layer reports that set (`onCells` → `setSubscribedCells`).
2. A reconnect re-counted a cell we already had a number for. A `welcome` now clears the stats
   for the cells it covers, since the hub is restating them from scratch.
3. A hidden tab gets no animation frames, so the render loop — which is what expires cars —
   simply stopped. Coming back showed drivers who had left minutes earlier. There is now a
   5 s wall-clock heartbeat that expires cars whether or not frames are running.

And the other half of it, on the way out rather than the way in: a socket the browser froze
never fires `onclose`, so the client believed it was connected. `visibilitychange`, `online`
and `pageshow` now tear down anything that has not heard from the hub inside 60 s and reopen it
immediately, and a freshly opened socket sends its position straight after `hello` instead of
waiting for the send policy — a stopped car reports only every 30 s and the hub evicts at 60 s,
so waiting would have left it invisible to everyone else. `net/sockets.test.ts` covers the
frozen socket, the healthy one, and the immediate position.

The HUD dims the counters when the socket is down. The numbers may be minutes old at that
point, and the dot alone was not saying so loudly enough.
