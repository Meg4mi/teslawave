# 0024. Positions are sent exactly, and drawn exactly where they were sent

Status: accepted
Date: 2026-09-05

## Context

Every position used to be offset by 50-100 m on the device before it was sent (0004), and
the map then nudged each other car's sprite onto the road it was plausibly on, to hide the
sideways part of that offset (0016). The result on a real screen was that other cars sat
visibly off from where they were: beside the road, on the wrong road, or a bend behind. The
owner's report was that the positions "look offset, like a bug".

The offset existed to protect drivers who had not agreed to be located. Sharing is opt-in, the
consent screen says what leaves the car, and with that consent the blur protects nobody and
misleads everyone: it is 50-100 m of error on a map whose whole point is where the other car
is, and the road nudge added its own error on top, up to 130 m, when the road guess was wrong.

## Decision

The fix goes out as the device reports it. The client sends the raw latitude and longitude,
rounded to nothing, and other cars are drawn exactly where the server put them. The fuzz
module, its constants and the road snapper are removed rather than switched off, so there is
no code path left that could quietly move a car again.

What still protects a driver is scope, not blur: a position is shown only to drivers in the
same map area, only while it is under 60 s old (0002), never written anywhere, and invisible
mode still drops it from the hub at once. The privacy screen and `docs/privacy.md` now say
that, in place of the blur they used to promise.

The wave ranges stay at 300 m to prompt and 450 m to accept (0007). They were widened for the
fuzz, but on a real road 300 m is about the distance at which two drivers can still see each
other, and the extra 150 m still pays for the two seconds the client renders behind.

## Rejected alternatives

- **Fuzz less, say 10-20 m.** Still a visible offset on a residential street, and it protects
  nothing: 20 m does not hide which house someone stopped at.
- **Keep the snapper for GPS noise.** Real fixes are on the road already, within the receiver's
  few metres; a snapper tuned for a 100 m offset would drag a car in a car park or a driveway
  onto the nearest road, which is exactly the kind of offset that was reported.
- **Keep the code and set the offset to zero.** A dormant module is a module someone will
  turn back on without re-reading why it was turned off.

## Consequences

Other cars are where they are, to the accuracy of two GPS receivers and the interpolation
delay: the client renders two seconds behind server time so there is always a sample to
interpolate towards, which at 100 km/h is about 55 m behind the true position. That is the
remaining offset, and it is the price of cars gliding rather than jumping.

0004, 0012 and 0016 are superseded. The raw-versus-smoothed distinction of 0019 remains: your
own sprite is eased between fixes, while distances and the wave prompt use the fix itself.
