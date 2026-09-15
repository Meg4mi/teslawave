# 0040. A status chosen from a list, a report placed where the car is, and a voice that says it

Status: accepted
Date: 2026-09-15

## Context

Three asks arrived together, all from the same place: the car screen is looked at in
glances, and the map so far only ever said "a blue Model Y is here".

1. A driver wanted to say one more thing about themselves than a model, a paint and a name.
2. Drivers wanted to flag the police or an accident to the cars behind them, the way Waze
   does, without leaving the map for it.
3. A wave arriving is a card and a chime; a driver with their eyes on the road asked to be
   *told* who it was.

Each of these can be built the expensive way. A status can be a free text field; a report
can be a database of places with votes and a moderation queue; a voice can be a recorded
set of lines or a hosted text-to-speech call. None of that fits an app that runs on a free
tier with no account, no moderation and no telemetry, whose privacy page says positions are
never written anywhere (ADR-0002, ADR-0024), and whose screen is typed on with a hostile
keyboard at a standstill (brief 2.2).

## Decision

### A status is one of five chips

`STATUSES` in the protocol is a closed list: `roadtrip`, `charging`, `commute`, `cruising`,
`newowner`. The id travels on the `hello`, in the socket profile, in a car's description on
either wire and with a wave, exactly as the nickname does. The words live in each language's
catalogue, so a French driver's "En balade" is read as "Just cruising" on an English screen.

- Nothing is typed, so there is nothing to moderate and nothing to type on the car.
- A status this build does not know is dropped by the guard, not refused, so the list can
  grow without a protocol bump: an old client simply does not show it (ADR-0029).
- It shows on the car card, on the settings row, as an aside on the card a wave raises
  ("waved at you · on a road trip"), and in the voice line. Not on the map sprite: a label
  per car is a DOM node or a text draw per frame, which ADR-0005 and ADR-0014 exist to
  avoid, and a status is for the moment you look at a car, not for traffic.

### A report is placed by the hub, held in memory, and names nobody

`REPORT_KINDS` is `police` and `accident`. A driver taps Report on the map, then one of two
large buttons; the client sends `{ t: 'report', kind, at }` with its own position to the hub
that owns the cell it is in.

- **The position is the client's, checked against the hub's.** The hub holds a position for
  a visible driver most of the time, but not just after a hibernation wake (ADR-0039), and a
  report is worth nothing a minute later. So the report carries the car's position, and
  where the hub does hold one the two must agree to within `REPORT_MAX_OFFSET_M` (1 km): a
  car cannot flag a patrol on a road it is not on. Where it holds none, the client's word
  is taken, as the hello's `at` already is.
- **Memory only.** Reports live in the hub's memory beside presence, are never written to
  storage, and are gone on hibernation as presence is. A report is a position, and the
  privacy page says positions are not written anywhere; that promise is worth more than a
  pin surviving a quiet hub's nap. In a region busy enough for reports to matter, the hub
  does not sleep.
- **Nobody is named.** What goes on the wire is `{ id, kind, lat, lng, at, n }`: where, what,
  when last confirmed, how many. The hub keeps the ids of the drivers behind a report in
  memory only, to stop one driver confirming their own report twice, and that set goes with
  the report. The privacy page says so.
- **One pin per thing.** A report of the same kind within `REPORT_MERGE_M` (300 m) of a live
  one confirms it: `n` goes up, the clock restarts, the pin stays. A patrol moves on, an
  accident takes longer to clear: `REPORT_TTL_MS` is 30 and 60 minutes from the last
  confirmation, enforced by the hub on flush and by the client on its own clock, so a socket
  that dropped cannot leave a patrol on the map for the rest of the drive.
- **Rate and cap.** One report a minute per connection (`RATE_REPORT_MS`); at most
  `MAX_REPORTS_PER_CELL` (50) live pins per cell, the oldest going first. That bounds hub
  memory and the size of one `reports` message.
- **Told on the tick, not filtered by interest.** Report news rides `flushIfDue` like the
  diffs, to every subscriber of the cell, and a cell's live reports are sent in full when a
  connection first holds it. A cell has a handful of pins at most and they are static, so
  the interest machinery of ADR-0033 would cost more than it saved; the client decides what
  is near enough to draw or to say.
- **On the screen.** A pin is a baked bitmap under the cars, with an entry ring as it lands,
  a slow pulse while it is within `REPORT_ALERT_M` (1 km), and a fade over its last five
  minutes so a stale one is visibly on its way out: the same budget as a car with its entry
  ring (ADR-0014). Coming within a kilometre of a pin raises one toast, one chime and one
  spoken line, keyed on the pin's id so it is said once however long it stays close; a line
  at the foot of the screen keeps counting the metres down while it is in range.
- **The words.** "Police" and "Accident", nothing finer. Not "speed camera": in some
  countries warning of one is restricted, and a patrol or a check is what a driver behind
  actually wants to know about. The terms already say the law where you drive wins.

### The voice is the browser's synthesiser, an octave down

`ui/voice.ts` wraps `speechSynthesis`: pitch 0.55, rate 1.08, the voice matching the
catalogue's language tag if the platform has one. It says the card's news ("Ghost, on a road
trip, waved at you", "The blue Model Y waved back") and the report alert ("Police reported,
600 metres away"), in the language the screen is in, from lines in the catalogue with the
grammar inside them (ADR-0023).

- No audio assets, no network, no hosted service: a voice from the platform costs nothing
  and needs nothing, which is the whole cost model.
- A line already being said is cut off; a burst of waves is one line each, never a queue
  still talking a minute later.
- Silent under the mute, off by its own switch in settings (on by default: it is the thing
  that was asked for), and heard once when the switch goes on, so the driver knows what they
  turned on without waiting for a wave.
- A screen with no synthesiser, or one that refuses without a gesture, is simply quiet:
  every call is guarded, the chime and the card carry the moment. Whether the car browser
  has any voices at all is a row for `docs/tesla-notes.md`; it has not been tested on a car.

## Rejected alternatives

- **A free-text status.** Typed on the car screen, and moderated by nobody. Five chips say
  what a driver would say and nothing they should not.
- **Reports in Durable Object storage, so they survive hibernation.** One write per report
  is well inside the budget, and a restore could read them back. It would put positions
  into storage for the first time, which is a promise the privacy page makes in so many
  words; and it would keep them past the moment the last driver who could see them left.
  Not without a decision that changes that page.
- **Reports in D1, with votes, so they can be listed and cleaned.** A table of places and
  times is a trip history by another name, and D1 from a message handler is invariant 3.
- **"Still there / not there" on a pin, as Waze has.** Wanted, and not now: it needs a
  second message, a way to count against a pin from a car that is not at it, and a UI for a
  pin you tap. The merge rule gives "still there" for free from anyone who reports again;
  "not there" waits for the lifetime. Revisit when a real road shows pins outliving their
  cause.
- **Recorded lines, or a hosted text-to-speech call.** Assets to download on LTE for a
  garnish, or a service that bills per character and needs a key. The platform's own voice
  is free, and the robot quality is the point rather than a compromise.
- **Speaking every event.** A sent wave, a milestone, a car appearing: the driver already
  knows about the first two and the third is noise. The voice speaks for things the driver
  did not do and would want to hear about: a wave arriving, and a report ahead.

## Consequences

- No protocol version bump: every addition is a field an old client ignores or a message it
  drops (`parseServerMsg` returns null for a type it does not know). An old hub drops the
  `report` message as a violation, which costs an old build one strike out of five.
- The hub holds a little more memory per live report and one more field per socket; the
  wire carries one more optional string per described car.
- `hubStats` reports the live pin count, so a hub whose pins never lapse is visible in
  `debugStats`.
- `/kitchen-sink` fires a police pin, an accident pin and a wave from a car with a status,
  with the voice, so the moment is judged there rather than on a motorway.
- The privacy page, in both languages, now lists the status and the report among what
  leaves the car.
- What would make us revisit: pins outliving their cause on a real road (add "not there");
  a region where 50 pins a cell is reached (raise the cap or shard); a car browser with no
  voices (record a handful of lines, or drop the feature).

## Amendment, 2026-09-15: a pin is answerable, a patrol outlives a clear-up, and a status can be written

Three things came back from the first cut, and all three were things this record had decided
against or had not thought hard enough about.

### "Still there" and "not there"

Rejected above as "wanted, and not now". It is now, and the objections turned out to be
cheaper than they looked: the second message is one message, the UI for a pin you tap is the
card every other object on this map already has, and "a car that is not at it" is answered
the same way a report's own position is.

- A tap on a pin opens a card: what it is, when it was reported, how many drivers say it is
  there, how many say it is gone, and the two buttons. A tap is a tap on the map, so pins
  compete with cars for the finger by distance rather than by layer order.
- `{ t: 'confirm', id, there, at }` carries the voter's own position. A vote counts only
  from within `REPORT_VOTE_RANGE_M` (2 km) of the pin — wider than the alert range, because
  the tap comes after the announcement and a car covers the difference while the driver
  decides — and, where the hub holds a position for them, within `REPORT_MAX_OFFSET_M` of
  it, exactly as a report is checked.
- **A report goes when as many drivers say it is gone as say it is there.** `n` and `no` are
  the sizes of two sets of driver ids, held in memory beside the report and never sent, so
  each driver counts once and can change their mind by voting again. One voice against one
  clears a pin nobody else has vouched for; a pin four drivers confirmed needs four. That is
  the right way round, and it is self-correcting in both directions, because a driver who is
  actually looking at the thing can report it again.
- Only a voice **for** a pin restarts its clock. A dismissal that failed to clear it must
  never buy it another ninety minutes.
- A pin somebody has disputed is drawn faint rather than removed: the map shows that it is
  doubted without deciding the argument, which the rule above does when the voices even out.

### The police last longer, and nothing lasts for ever

The first cut gave a patrol thirty minutes — the shortest life of anything on the map, for
the thing drivers most want to know about — and an accident sixty. That is backwards. A
patrol parked on a bridge is there for the afternoon; an accident is cleared by people whose
job that is, usually within the hour. So `REPORT_TTL_MS` is now **90 minutes for the police**
and 60 for an accident, measured as before from the last driver who said it was there.

"Still there" makes that a problem it was not before: a lifetime that restarts on every
confirmation is a pin that never dies, and one driver passing their own report every hour
would keep it alive for ever. So there is a ceiling, `REPORT_MAX_LIFE_MS`, **four hours from
when the report was placed**, and it is not extended by anything. A pin lapses at the earlier
of the two clocks, and both sides work that out from the same two numbers — `at` and `first`,
both on the wire — rather than the hub sending a deadline, so the rule is one rule rather
than two implementations of it.

Four hours is longer than any of these is plausibly true and short enough that a stale pin is
somebody's afternoon rather than their week.

### A status the driver writes

Rejected above on two grounds: nothing typed on the car screen, and nothing to moderate.
The first is a real constraint and the second was an overstatement.

The keyboard argument is about *driving*, and a status is set at a standstill, next to the
nickname field that has always been there. The moderation argument does not survive contact
with that nickname: this app already carries a free text field that every driver around you
can see, with the same cap, the same cleaning and the same absence of moderation. A written
status is that bargain again and not a new one.

So `statusText` sits beside `status` on the wire, at most `STATUS_MAX_LEN` (24) characters,
trimmed and collapsed and trimmed again like a nickname. The two are one choice: picking a
chip clears the text and typing clears the chip, on the client and again in the guard, where
a chosen status wins if a confused client sends both. The chips stay first and stay the
default, because five taps cover most drives and one of them is what a driver does at 80
km/h; the field is for the drive the five cannot describe.

A written status is shown as its author wrote it and translated for nobody. The voice treats
it differently from a chip for the same reason: a chosen status is read as an aside inside
our own sentence because we wrote the words and know they fit, and a written one gets a
sentence of its own ("Ghost waved at you. Their status: towing a caravan."), because dropping
somebody's phrasing, possibly in another language, into the middle of ours reads as a fault.

### What the longer life costs, and what bounds it

A pin that lives up to four hours is the first thing this hub holds that outlives the socket
that created it, which is a property the cost model had never had to have an opinion about
(ADR-0002, amended, has the numbers and the reasoning). Two things came out of checking it,
and both were real:

- **The per-cell cap bounded a message, not the object.** 50 pins a cell across a hub's
  32 x 32 cells is 51,200 pins, which measured at 541 MB of retained heap against a Durable
  Object's 128 MB. There is now a `MAX_REPORTS_PER_HUB` of 1,000, as sockets have had a
  per-hub cap beside their per-cell one all along, and a `MAX_REPORT_VOTERS` of 100 a side,
  because the drivers vouching for a pin were the one part of it that was not a fixed size.
  The worst the caps now allow measures at 41 MB, and the ordinary case at about 1 MB.
- **The sweep walked every pin on every tick.** Copying the whole map twice a second to find
  nothing is the full-hub scan ADR-0033 took out of presence, arrived at from a different
  direction. It runs against a watermark of the soonest expiry now, so a tick that cannot have
  lapsed anything does nothing, and a hub at its cap costs the same per idle tick as an empty
  one. Pins are indexed by cell for the same reason presence is.

Neither of the five invariants moved: pins are memory only and never reach storage, the sweep
is driven by arriving messages like every other tick, and nothing here adds a timer, a fetch or
a socket. `pnpm bench` now prints the pin table beside the fan-out one.

### Consequences of the amendment

- Still no protocol bump: `confirm` and `confirmed` are a message an old hub counts as one
  violation and one an old client drops, and `statusText`, `first` and `no` are fields either
  side can ignore. A hub from before this sends no `first`, and a client reads its absence as
  "placed when it was last confirmed", which is the reading it already had.
- The hub holds a second set of driver ids per live report. Memory only, gone with the
  report and on hibernation, like the first.
- A driver can clear somebody else's pin. That is the point, and the bound on abuse is the
  same as for reports: one vote per driver per pin, a position that has to make sense, and a
  rate limit. A pin cleared wrongly is one report away from coming back.
- What would make us revisit: pins being cleared faster than they are confirmed on a real
  road (weight a dismissal by distance, or require two); a written status being used for
  something a nickname is not (the same answer would have to apply to both).
