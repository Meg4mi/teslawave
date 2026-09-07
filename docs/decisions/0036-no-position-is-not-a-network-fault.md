# 0036. A phone with no position is not a phone with no network

Status: accepted
Date: 2026-09-07

## Context

Reported from a phone: the HUD said "Reconnecting…" for as long as the app was left open, on a
connection that was working. Nothing was wrong with the network, and nothing was reconnecting.

The chain behind it: no position means no cells, no cells means no hub, no hub means no socket
was ever opened. `refreshStatus` calls that state `connecting`, and the HUD rendered
`connecting` and `reconnecting` with the same sentence — so an app that had not started yet
described itself as an app that had fallen over.

Why there was no position: `watchPosition` was given `timeout: 15_000` and a device that
cannot get a fix does answer that with a TIMEOUT error. A device that answers with *nothing*
does not. An iOS permission sheet that is never dismissed, and a watch the browser quietly
dropped on its way out of the background, both leave the callbacks silent for ever. `status`
sat at `idle`, which is neither granted nor denied, so the spectator fallback — which centres
the map from `/api/whereami` and opens a socket — never ran either.

## Decision

Waiting for a fix is bounded and said out loud.

- The first fix has 20 seconds. If nothing at all has arrived by then the driver becomes a
  spectator: the map centres on the rough origin, the socket opens, other cars appear, and the
  screen says location is off. The watch stays registered, so a late fix promotes them back to
  a driver on the map.
- Three states, three sentences: "Waiting for your location…" while the device has not
  answered, "Connecting…" for the first socket, "Reconnecting…" only for one that was open and
  is not.
- A `POSITION_UNAVAILABLE` **after** a fix is a gap, not a verdict — a tunnel, a car park, a
  street of tall buildings — and no longer demotes a driving car to spectator and tears down
  its socket. Only `PERMISSION_DENIED` is an answer.
- A watch that has said nothing for 30 seconds is replaced when the tab comes back, because
  iOS stops delivering to a watch registered before the app went away and never says so.

## Rejected alternatives

- **Shorten the geolocation `timeout`.** It is already answered by the devices that answer;
  the failure is silence, and no timeout value fixes a callback that never fires.
- **Show the spectator screen immediately and upgrade later.** Twenty seconds is well inside
  a cold GPS fix on a phone, and telling a driver their location is off while their phone is
  still finding it is its own wrong answer.
- **Open a socket on the rough origin while waiting.** It would put the driver in a hub they
  are probably not in, then move them out of it seconds later, for a few seconds of counts.

## Consequences

The app can no longer sit in a state where it is neither on the map nor saying why. Every path
out of "no position" ends somewhere honest within 20 seconds: a driver, a spectator, or a
driver who has said no. The cost is one flip of the socket in the rare case where the fix
arrives after the deadline.
