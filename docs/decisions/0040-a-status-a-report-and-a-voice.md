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
