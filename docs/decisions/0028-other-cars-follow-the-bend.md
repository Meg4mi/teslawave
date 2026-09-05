# 0028. Other cars follow the bend: a curve between samples, a turn beyond them

Status: accepted
Date: 2026-09-05

## Context

Reported from the car: your own car follows the road, the other cars do not. Your own car
is fed a fix a second and eased (0019). Every other car is drawn from the hub's samples,
which a moving car sends every 5 s (0009), and two things in how it was drawn between them
put it off the road on every bend:

- **Between two samples it went in a straight line.** A 150 m bend at 90 km/h is 48 degrees
  of arc between samples; the chord across it passes 13 m inside the curve, a car's length
  into the verge, on a map whose roads are drawn to the metre (0024).
- **Beyond the last sample it went straight on.** The client renders 2 s behind server time
  so that there is a sample ahead to interpolate towards (0002). That holds at the 2 s rate
  limit, not at the 5 s cadence a moving car actually uses: for three seconds of every five
  the drawn time is past the last sample and the car was dead-reckoned along its last
  heading, off the bend on a tangent, then pulled back over a second when the next sample
  arrived (the correction of `pushSample`).

## Decision

Both in `packages/protocol/src/motion.ts`, pure and tested against a true circular arc.

**Between two samples, a cubic Hermite curve** with each sample's velocity (heading and
speed, over the interval) as its tangent. A car that reports heading 90 at one sample and
138 at the next is on the arc those tangents describe; the curve is within 3 m of the true
arc where the chord was 13 m off. The sprite's heading is the curve's own direction, not a
blend of the two reported headings. Tangents are capped at twice the chord so a reported
speed that contradicts the distance cannot bend the curve into a loop.

**Beyond the last sample, constant-turn-rate dead reckoning**: the turn rate the last two
samples imply (clamped to 30 degrees a second, a roundabout) is kept up, so a car mid-bend
goes round the bend rather than off it. The turn is capped at 90 degrees in total: a bend,
never a loop. The exact arc is used (a constant speed and turn rate is a circle), not a
polyline.

## Rejected alternatives

- **Render further behind, 6 s, so a sample is always ahead.** Every other car then sits
  170 m behind where it is at motorway speed; 0024 accepted 55 m as the price of gliding and
  that is already at the limit of what reads as "where the car is".
- **Send positions more often on bends** (a smaller heading-change threshold than 20
  degrees). Helps, costs messages against the binding budget (0002, 0009), and still leaves
  the tangent problem for whatever interval remains.
- **Bring back the road snapper for other cars.** 0024 removed it because a snapper tuned
  for a 100 m offset drags a car park onto a road. A snapper with a 10 m tolerance would fix
  the chord but not the tangent, needs the map's rendered roads, and was the expensive part
  of the frame on the car (0016's numbers). Corrections of a few metres from GPS are not
  what was reported; the shape of the path was.
- **Ease the correction more gently.** Hides the pull-back and makes it longer; the car is
  still off the road while it lasts.

## Consequences

- A car between samples is where its headings say it is, to a few metres, and past the last
  sample it continues the bend for up to three seconds before the next sample confirms or
  corrects it. When a bend ends between samples the car overshoots the turn by the turn rate
  times the gap, at most a few degrees, and the next sample corrects it as before.
- Nothing changes on the wire or in the hub. Your own car is unchanged (0019).
- What remains is GPS noise, a few metres, which nothing in the drawing should try to hide.
