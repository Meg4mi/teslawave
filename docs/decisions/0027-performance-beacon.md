# 0027. An opt-in, anonymous performance beacon from real screens

Status: accepted
Date: 2026-09-05

## Context

The brief's hardest constraint is that the app is smooth on an MCU 2 (brief 2.2, 6). CI has
no GPU, so its numbers say nothing about that (0021, `e2e/perf.spec.ts`), and the only real
data was a table in `docs/tesla-notes.md` that somebody has to remember to fill in. Both rows
for real cars were still marked pending.

## Decision

A setting, **off by default**: "Share performance data". While it is on, the client posts to
`/api/perf` two minutes into a session and then every ten minutes, while the tab is visible
and once at least 300 frames have been measured. The sample is: pixel ratio, viewport size,
whether the user agent is the Tesla browser and its Chromium major version, mean and p95 of
our own per-frame work (the same measurement the e2e gate uses, now taken on every frame
rather than only under test), whether the 30 fps and low-resolution fallbacks are engaged,
and how many cars were on the map.

The Worker validates the sample against a fixed schema, drops anything it does not know, and
inserts one row into D1. Rows are pruned after 30 days by the daily cron. `pnpm perf` prints
one line per kind of screen.

Anonymity is by schema: there is no column a position, an id or a nickname could land in, and
the test asserts as much. What a sample can say about a person is the model of screen they
have, which every other driver in the cell can already see from their car's model.

## Rejected alternatives

- **On by default.** The privacy page says the app is built so there is nothing to leak; a
  telemetry channel on by default is a strange first thing to add to that.
- **Cloudflare Web Analytics custom events.** Not available on the free beacon, and the numbers
  wanted are continuous, not counts.
- **A row in `tesla-notes.md`, kept by hand.** Still the place for anything that felt wrong.
  The beacon is for the numbers that nobody will write down on a motorway.

## Consequences

- One request every ten minutes per opted-in driver, against the Worker's 100k a day (0002).
  Negligible at any plausible opt-in rate.
- The frame cost ring buffer runs always. Two `performance.now()` calls and a push per frame.
- The next change to the rendering path can be judged against real screens, not just CI.
