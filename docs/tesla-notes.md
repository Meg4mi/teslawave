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
| 2026-09-04 | Tesla car screen | pinch to zoom, where other cars sit | pinch barely worked and other cars sat beside the road. Both fixed: ADR-0017 and ADR-0016. See below. |
| 2026-09-04 | Tesla car screen | pinch again, car sprites | zoom ceiling raised, our per-frame work stands aside during a gesture, zoom buttons added; sprites re-traced per model (ADR-0018). |
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


## 2026-09-04 — pinch, and cars in the fields

**Pinch to zoom barely worked.** The camera followed the driver unconditionally, up to thirty
`jumpTo` calls a second. MapLibre's two-finger handler computes its zoom from how the touch
points move against the current transform, so every one of those calls moved the ground out
from under the gesture — the zoom read as slipping, and a drag was undone within 33 ms. A real
gesture now suspends the camera for six seconds (ADR-0017). A tap does not count: one finger
has to travel ten pixels, two fingers down is always a pinch. The camera comes back on its
own, keeping whatever zoom you chose, and a "Back to my car" pill is there for anyone who does
not want to wait.

**Other cars sat beside the road**, in fields and car parks. That is the 50–100 m privacy fuzz
doing its job — 75 m sideways on a motorway is a field — and fuzzing less is not available.
So the *drawing* is put back on the road instead: each other car is moved onto the road it is
most plausibly on, scored on distance adjusted for heading and, above 80 km/h, road class. The
position we send and validate waves against is untouched (ADR-0016). Nothing is invented: if
no road scores within 130 m, the car stays where the server put it, and below zoom 13 or
before tiles load the correction is simply absent.

Cost of the snapping, measured by the perf spec with 20 cars at 6x CPU throttling: our own
per-frame work went 3.38 ms mean / 8.20 ms p95 before, 5.47 / 13.30 with a naive version, and
4.20 / 7.60 once off-screen cars were skipped and the re-snap interval went to 1.2 s. Budget
is 8 ms mean. The lesson for the car: the query behind this is the expensive part, so it is
rationed to two cars a frame and only for cars actually on screen.

Both are worth re-checking on the car: whether pinch now feels like the built-in map, and
whether cars sit on the road you can see out of the windscreen — particularly on a motorway
with a service road running alongside it, which is the case the scoring exists for.


## 2026-09-04 — pinch, second pass, and the sprites re-traced

Pinch was reported as still poor after the camera fix. Three things were wrong beyond the
camera, and only one of them was input handling:

- **The zoom ceiling was 17**, a zoom and a half above the one we follow at, so pinching in ran
  out of room almost at once and read as "pinch barely does anything". It is 19 now.
  OpenMapTiles data stops at zoom 14 and the client overzooms past it, so this costs no tiles.
- **We were competing for the frame.** While a finger is down the map is re-tessellating every
  frame, which on an Intel Atom is the whole budget. Road snapping and trails now stand aside
  for the duration of a gesture.
- **A pinch is an awkward gesture to make while driving at all.** There are zoom buttons at the
  bottom left now, the same object as the app's other controls.

The gesture itself was verified with real two-finger touch events dispatched through CDP
(`e2e/pinch.spec.ts`), which is what the camera work should have been tested with in the first
place: Playwright's mouse cannot express a pinch, so the first round only ever tested a drag.

**The sprites are now traced per model** rather than five variations on one parametric shape
(ADR-0018). Worth checking on the car: whether a Model 3 and a Model Y are tellable apart at a
glance while moving — the 3's body-coloured roof bar against the Y's uninterrupted glass is the
tell, and it is a few pixels at the follow zoom.
