# Notes from real cars

The only performance data that actually counts. CI has no GPU, so its numbers say nothing
about MCU 2 (see `apps/web/e2e/perf.spec.ts` for why the CI gate measures our own per-frame
work instead of composite frame rate).

Add a row per session. Keep the failures: they are the useful part.

Live at **https://teslawave.app** — open that on the car screen, or set it up on a phone
and bring it across with a pairing code. The workers.dev address still answers and is what
preview deploys use.

| Date | Car / firmware | What was tested | Result |
|---|---|---|---|
| 2026-09-04 | none (CI container) | first deploy | Worker, Durable Object, D1 and cron live; seven smoke checks green, including a real WebSocket welcomed by the hub |
| 2026-09-04 | Tesla car screen (photo) | live map, wave toast, counters | two bugs, both fixed: the "waved at you" toast never disappeared, and the online counts drifted as the connection came and went. See below. |
| 2026-09-04 | Tesla car screen | pinch to zoom, where other cars sit | pinch barely worked and other cars sat beside the road. Both fixed: ADR-0017 and ADR-0016. See below. |
| 2026-09-04 | Tesla car screen | pinch again, car sprites | zoom ceiling raised, our per-frame work stands aside during a gesture, zoom buttons added; sprites re-traced per model (ADR-0018). |
| 2026-09-04 | Tesla car screen | turning | the camera moved once a second, not every frame. Own position is interpolated now, and the camera pauses on touch-down (ADR-0019). |
| 2026-09-04 | Tesla car screen | real time, other cars, frame rate, settings rows, the wave button | four bugs fixed and three costs cut, see below. Wave range widened to 300 m and the button redesigned. |
| 2026-09-09 | Model Y (Juniper), firmware not recorded | general use on the car screen | works. Map, own car, other cars and the wave all behave. No numbers taken: cold load, frame rate and whether the resolution fallback engages are all still unmeasured here |
| _pending_ | 2019 Model 3, MCU 2 | first load, map, own car moving | not yet run on a car |
| _pending_ | 2022 Model Y, MCU 3 | same | not yet run on a car |

The Juniper row is the good case, not the hard one: it is an AMD Ryzen unit, and every
rendering decision in this project — the canvas overlay, the tile style, the 30 fps and 1x
resolution fallbacks, the interest radius and the compact wire — exists for the Intel Atom in
MCU 2 (ADR-0001, ADR-0005, ADR-0006, ADR-0021, ADR-0033). "Fine on a Juniper" is evidence
that the app works on a real car and no evidence at all about the hardware it was designed
around. The two pending rows are still the ones that matter.

## The beacon

A row in the table above needs someone to remember to write it. The app can also report for
itself: **Settings → Share performance data** sends, two minutes into a drive and then every
ten, the numbers that matter here and nothing else (screen density and size, browser
version, mean and p95 of our own per-frame work, whether the 30 fps and low-resolution
fallbacks engaged, how many cars were on the map). Off by default, anonymous by schema, kept
30 days (ADR-0027). Turn it on in the car, drive, and read it back with:

```bash
pnpm perf          # last 7 days, one line per kind of screen
pnpm perf 30
```

A mean over 8 ms is the e2e budget being missed on a real screen, and it is marked.

## 2026-09-07 — the border blink, found without a car

The first one of these not reported from a drive. The hub and the client are both pure, so
they can be run against each other on a virtual clock, and
`apps/web/src/sim/roundtrip.test.ts` now does (ADR-0031).

It failed on code believed fixed. A car crossing a cell border is announced gone from the old
cell and updated in the new one, and the client's guard from 2026-09-04 — delete on a `gone`
only if the car is still in the cell the message names — works only when the update arrives
first. Which comes first depends on which cell happened to be marked dirty first, so as soon
as any other driver was reporting in the cell being left, the departure won and the car
blinked. On a motorway with traffic that is most crossings, which is exactly where it was
reported originally and exactly where the fix would have looked like it worked.

A departure is now filtered per subscriber: a car still in this hub, in a cell you also hold,
is not reported gone to you. It means "gone from your map", not "gone from this cell".

Worth checking on the car anyway: drive a motorway across a cell boundary with other drivers
around and watch whether anyone blinks. The rig says no; a rig is not a car.

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


## 2026-09-04 — "a bit laggy when I turn"

Not frame rate. The camera was moving once a second.

Every other car is interpolated between server samples; your own car was drawn straight from
the raw fix, and `watchPosition` gives about one a second. So the map held still for a second
and then jumped — at 100 km/h a 28 metre step, and through a bend the whole turn at once.
Own position is dead-reckoned forward at frame rate now and eased toward, so the map glides and
turns (ADR-0019).

Fixing it exposed the deeper half of the pinch problem. With the camera moving every frame
instead of once a second, gestures stopped working altogether: a `jumpTo` between a finger
landing and its first movement cancels the gesture inside MapLibre before it becomes one. The
camera now pauses the moment a pointer lands, and resumes immediately if the finger lifts
without travelling. ADR-0017's version — wait for the first movement, and listen for MapLibre's
`dragstart` — was one frame too late and listening for an event a following camera prevents.

Two bugs found while looking:

- The renderer threw `The radius provided (-72.28) is negative` from `ctx.arc` on most frames
  at boot. `performance.now()` read inside a handler is a few milliseconds ahead of the frame's
  own timestamp, so the boot sonar's progress was briefly negative. The throw took the rest of
  that frame's drawing with it — cars, your own car, ripples. Radii are clamped now.
- Changing your car used to replace the identity object, which tore the socket down, cleared
  the world and re-fuzzed the position. Profile changes go down the open socket as a fresh
  `hello`; the connection is keyed on who you are, not what you drive.

Worth checking on the car: whether a turn now reads as a smooth sweep, and whether a
one-finger pan and a pinch both take hold immediately rather than after a beat.


## 2026-09-04 — real time, positions, frames, and the wave button

Five things asked for after a drive; what was actually wrong, and what changed.

**The wave button only ever came once.** Its ten-second window was a single `expired` flag
that nothing reset, so after the first car of the drive had passed, no later car got a prompt
— and the same object was handed over twice a second, which restarted the countdown whenever
a wave had been counted in the cell that day. It is keyed on *which* car now
(`screens/WaveButton.tsx`, with a test that fails against the old code): a new car gets a
fresh window, a wave sends the button away with its exit animation, and the same car gets a
second prompt only once it has been out of range and back.

**Cars vanished for a few seconds at cell borders.** A car crossing from one geohash cell to
the next is announced as an update in the new cell and a departure from the old one, and the
hub sends the update first. The client deleted on the departure regardless, so every car
blinked out at every border until its next report. A departure now only counts for the cell
the car is actually in (`sim/world.ts`).

**Ghosts after a reconnect.** A `welcome` restates a cell from scratch, but the client only
added what was in it; a driver who had left while the socket was down stayed on the map for
up to a minute. The welcome now removes anyone in those cells who is not in the snapshot.

**A car slid across the map after the phone came out of a pocket.** The correction that
blends a late sample was measured from wherever the car was last *drawn*, however long ago.
After a gap the car is placed and nothing is blended (`protocol/motion.ts`).

**Other cars sat at an angle to their road.** Snapping put the sprite on the road but kept
the reported heading, which carries the fuzz's own noise. A moving car is now turned to lie
along the road it was put on, when it is within 30° of it; a bigger mismatch is left alone
because it is probably a real turn (`map/snap.ts`, display only, the wire heading untouched).

**The wave range was too tight.** Between two fuzzed positions, 150 m rarely happened even
side by side. It is 300 m now, the server accepts at 450 m, and the button was redesigned:
the car in a dark well, a breathing accent halo, rings leaving the wave icon, the countdown as
a track under the name (ADR-0007, amended).

**The settings rows with a chevron were reported as too hard to hit.** Only the 24 px chevron
was the button. The whole 72 px row is now, and the chevron sits in a circle so the row
visibly ends in a control.

**Frame cost.** Three cuts, none of which changes what is drawn (ADR-0021):

- The overlay projected every point through `map.project` — over a thousand calls a frame with
  twenty cars and their trails. It now recovers the map's affine transform once per frame
  from three real projections and checks it against a fourth.
- Trails were sixty strokes per car. They are quantised into six alpha levels, one path each,
  and a car far off the screen has no trail walked at all. Not a measurable win on the CI
  rasteriser (see the table); expected to be one on a GPU canvas.
- The vector map was always drawn at the device's pixel ratio. Once frames are measured slow,
  it drops to 1x for the rest of the session; the cars stay at full density.

Perf spec numbers, 20 cars at 6x CPU throttling, our own per-frame work, mean over three
runs each (single runs vary by about a millisecond: 30 samples at 5–6 fps in a container with
no GPU):

| Case | Before | After |
|---|---|---|
| Panning | 5.6 ms | 6.9 ms, or 5.8 ms with the wave button's CSS animations disabled |
| Turning 25°/s | 5.8 ms | 4.0 ms |
| Panning, trails off | 4.7 ms | 5.8 ms |

Two things that table taught. Trails cost about a millisecond on both sides: on a software
rasteriser the batched paths draw no faster than the per-segment strokes did, so the
batching's gain, if any, is on the GPU canvas the car actually has and is not proven here.
And the panning number is now sensitive to CSS on screen: with the 300 m range the wave
button is up for most of the test, and its transform/opacity animations are composited on
the CPU in this container and steal cycles from our frame. On the car they run on the GPU,
which is the whole reason ADR-0014 allows them; but they were trimmed anyway (the halo flares
once and holds, the icon rings three times and rests) because the cheapest animation is the
one that is not running. Budget is 8 ms; a single run can still touch it, which is why the
gate is advisory in CI. The composite number in CI still says nothing about a
car (no GPU); the resolution latch in particular needs a real screen at density 2 to judge.

Worth checking on the car: whether the wave button now appears for cars that are plainly
alongside; whether other cars lie along the road rather than across it; whether a border
crossing on the motorway still makes anyone blink; and, on a density-2 screen, whether the map
softening after a slow spell is noticeable, and whether it is worth it.


## 2026-09-05 — "a car goes offline for no reason, even with the app open on two devices"

Reported from real use, not reproduced on a car; found by reading the code against the report.
Two things could do this, and neither had anything to do with the second device.

**A device that stops getting fixes stops reporting, and nothing notices.** The position was only
ever sent from the geolocation callback. A parked car whose `watchPosition` goes quiet, or a
phone whose screen dims, sent nothing — while its socket stayed open, its pings kept being
answered, and its own HUD said live. The hub forgets a driver 60 s after their last position,
so one missed 30 s report was enough for everyone else to watch the car vanish. ADR-0009 had
rejected send-on-change for exactly this reason; the implementation was send-on-fix, which is
the same failure with a different trigger. The net layer now repeats the last fuzzed position
at the stationary cadence when nothing else was sent in that time, and only then, so a device
that is getting fixes sends nothing extra (`net/sockets.ts`, three tests).

**A reconnect after the hub had gone to sleep wiped the map.** Presence lives in the hub's
memory only and a hibernation wake starts from nothing, with everyone reporting back over the
next 30 s (ADR-0002). The reconnect is often what wakes it. The client treated the welcome
snapshot as the whole truth and deleted whoever was not in it, so every car around blinked
out and trickled back one by one, and "N online" read 0 for a moment. Anyone missing from a
welcome now gets until their next report to show up before they go (`sim/world.ts`). A driver
who really left while the socket was down still disappears twice as fast as the plain expiry
sweep would have managed.

Still true, and worth knowing when testing with a phone paired to the car: turning "invisible"
on on either device drops the shared presence for both, and the car comes back on the other
device's next report. That one is a choice, not a bug, and it is not what the report described.

Worth checking on the car: leave it parked with the app open for five minutes and watch it from
a second device. It should never disappear.


## 2026-09-05 — "the other cars look offset, like a bug"

Not a bug: two features, both removed (ADR-0024).

Every position was blurred by 50–100 m on the device before it left (ADR-0004), and the map then
nudged each other car onto the road it was plausibly on to hide the sideways part of that blur
(ADR-0016). On a real screen that read as cars beside the road, on the wrong road, or a bend
behind. With sharing opt-in and the consent screen saying what leaves the car, the blur
protected nobody, so the client now sends the fix as the device reports it and draws other
cars exactly where the server put them. The privacy screen says so in both languages.

What is still offset, and by design: the client renders two seconds behind server time so
there is always a sample to interpolate towards. At 100 km/h that is about 55 m behind the
true position, and at a standstill it is nothing.

Worth checking on the car: whether a car alongside now sits alongside, and whether one in a
car park sits in the car park rather than on the road past it.
