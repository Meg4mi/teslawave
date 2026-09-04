# Notes from real cars

The only performance data that actually counts. CI has no GPU, so its numbers say nothing
about MCU 2 (see `apps/web/e2e/perf.spec.ts` for why the CI gate measures our own per-frame
work instead of composite frame rate).

Add a row per session. Keep the failures: they are the useful part.

| Date | Car / firmware | What was tested | Result |
|---|---|---|---|
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
