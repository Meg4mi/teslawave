# 0039. A wave the hub cannot place is held and asked about, not refused

Status: accepted
Date: 2026-09-07

## Context

Drivers reported seeing the wave button, tapping it, and being told "Turn yourself back on
to wave" while they were visible. Quite often.

The hub refused a wave as `hidden` in three cases: the sender was invisible, the sender was a
spectator, or the hub had no presence entry for the sender at all. The client showed the
same line for all three, and the third is not the driver's doing.

The third case is the ordinary state of a hub that has just woken. Presence is memory only
and is never written anywhere (ADR-0002, invariant 5), so a hibernation wake rebuilds the
sockets from their attachments and nothing else: the hub knows who is connected and not
where anybody is, until each car's next report. A moving car reports every 5 s; a stopped
one every 30 s (ADR-0009). Cloudflare evicts an idle object after a few seconds' silence, so a
hub with two cars sitting at a charger or a light hibernates between nearly every message,
and the wave itself is what wakes it. The wave arrives at a hub with an empty map, the
sender has no presence, and the answer was `hidden`.

The client, meanwhile, keeps every car for 60 s (ADR-0031) and still shows the one beside
you, with the button. Both halves were right by their own lights. ADR-0002 accepted that
presence is "rebuilt by clients within one send interval after a wake" and did not notice
that a wave inside that interval fails, with the wrong words.

## Decision

**A wave the hub cannot place is held while the hub asks the missing party where they are.**

- The hub refuses `hidden` only when the sender is invisible or a spectator: the cases the
  driver can do something about.
- When the sender, the target, or both have no presence but do have a connection that
  could answer (open, visible, not a spectator), the hub holds the wave in memory and sends
  each such connection `{ t: 'where' }`. Outgoing messages are free.
- The client answers `where` with its last fix at once, outside the send policy, on every
  hub it holds. It does not answer inside the hub's position rate limit (`RATE_POS_MS`):
  a report that recent is one the hub already has, and a second would count as abuse. For
  the same reason the hub asks one connection at most once per rate-limit window, however
  many drivers are waving at it.
- Held waves are settled after every message and every close, never by a timer (ADR-0002,
  invariant 1). A position in answer to `where` delivers the wave that asked for it in the
  same turn, through the same validation as a wave placed on arrival. A target that never
  answers within `WAVE_HOLD_MS` (3 s) is `offline`, as it would have been; a sender that
  never answers gets a new reason, `nofix`, which the client tells as the hub's problem
  ("The map lost your position. Try again in a moment."), not the driver's.
- A target with no connection that could answer is `offline` at once, as before. One held
  wave per connection: a second tap while the first waits is `rate`, as it would be after a
  delivered one. A sender who hides while their wave is held gets `hidden`, which is then
  true.
- The `where` message and the `nofix` reason are additions an old client ignores. An old
  build that is asked and does not answer gets `nofix` after the hold and, not knowing it,
  shows the line it always showed. No protocol version bump (ADR-0029: a field an old client
  can ignore is not a bump).

## Rejected alternatives

- **Put positions in the socket attachment so a wake restores presence.** Would fix the
  target's side as well as the sender's without any new message, and would put a position
  into something that outlives the object's memory. Invariant 5 and the privacy page both
  say positions live in memory only; the attachment is written by the runtime on our behalf,
  which does not make it memory. Not without a decision that changes that page.
- **Answer honestly and let the client retry.** A new reason alone fixes the words, not the
  wave. And the client cannot know when the target's position has landed, so its retry
  would be a guess at a delay, with `offline` as the likely answer for a car it can see.
- **Ask everybody on the first message after every wake.** Rebuilds the whole map within
  one round trip, which would also mend the "N online" counter dipping after a wake. It
  costs one incoming message per connected car per wake, and a quiet hub wakes on nearly
  every message: at the stationary cadence that roughly doubles inbound traffic in exactly
  the regime the free tier is judged on. The wave is rare and the ask is on demand; the
  counter dip is cosmetic and stays.
- **Keep the hub awake while cars are present.** That is a timer, and the whole cost model
  is that there is none.

## Consequences

- A wave into a freshly woken hub takes one extra round trip before it is confirmed. The
  client already chimes and ripples on the tap, so nothing visible waits on the confirmation
  except the counter.
- The hub now holds a small amount of state per in-flight wave, memory only, dropped on
  hibernation like everything else: a wave held across a hibernation is lost, which needs
  the hub to sleep during the three seconds its own `where` messages are being answered.
- A failure that nobody's message settles waits for the next message of any kind, so an
  `offline` verdict on a dead target can arrive late in a very quiet hub. The client shows
  it as a toast whenever it comes.
- `hubStats` reports the held count, so a hub holding waves that never settle is visible in
  `debugStats`.
