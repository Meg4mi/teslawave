# Design QA

Walked before a release, on a real car screen where possible, otherwise at 1920x1200 in both
pixel densities and on a phone in portrait. A moment that does not land is a bug, not a
polish item.

Record the date and what you found. `/kitchen-sink` (development) fires every moment on
demand so they can be judged side by side.

## The seven signature moments

- [ ] **Boot** — wordmark and one cyan sonar sweep while the map initialises, under 1.2 s,
      once per session, never a spinner.
- [ ] **Go** — your car, the real model in the real colour, lands with an overshoot and the
      camera eases in. This is the first time a driver sees themselves.
- [ ] **Someone appears** — fade in over 300 ms with a single expanding ring. Never a pop-in.
- [ ] **Approach** — both sprites breathe, a dashed cyan line joins the two cars, the wave
      button rises with a countdown bar running out under the car's name, and an accent halo
      breathing around it.
- [ ] **Wave sent** — press compresses, the button collapses, a cyan comet flies from your car
      to theirs, the line between you lights up, their car pops as it lands and three rings
      leave it, and the sent chime plays. About two seconds, never more.
- [ ] **Wave received** — a warm comet arrives, your car pops, five warm rings leave *their*
      car and cross the whole screen, the screen edges flash once, a card at the top shows
      their car large with "waved at you", the counter rolls up, and a chime that is audibly
      different from "sent". It must be noticed with the eyes on the road, sound off.
- [ ] **Waved back** — both within four seconds reads as its own beat: the card says "waved
      back". After an unprompted wave, the button comes back warm as "Wave back" for the
      sender, even if their window had already run out.
- [ ] Every part of a wave is transform, opacity, or a canvas stroke; the edge flash leaves the
      DOM within a second (ADR-0022).

## The rest

- [ ] Milestone card at wave 1, and it is personal: no ranking, no comparison.
- [ ] Trails visible and fading; traffic reads as light painting from above.
- [ ] HUD legible over both dark ground and a bright motorway.
- [ ] Roads, water and labels are all clearly visible on the map, at the floors in ADR-0006.
      A dark map is the point; an invisible one is a bug.
- [ ] Every control says what it does without hovering, because a car screen has no hover.
- [ ] All five car sprites are distinguishable from each other, and which way each one points
      is obvious at a glance. On `/art`, each one reads as the car it claims to be: the 3's
      split roof, the Y's hatch, the S's bonnet, the X's windscreen and roof glass, the
      Cybertruck's vault.
- [ ] The car in onboarding, in the garage, on the card and in the wave button is the same
      drawing as the sprite on the map, in the same paint.
- [ ] Onboarding on the car screen reads as a configurator: car left, choices right, one white
      button; on a phone the same thing stacks and nothing is cut off.
- [ ] Every dialog is a centred card on the car and a bottom sheet on a phone, with its title
      and close button in the header; settings toggles are switches.
- [ ] Empty state is honest and inviting, not a spinner.
- [ ] Nothing interactive within 40 px of any screen edge; every target at least 64 px.
- [ ] Sent, received and milestone sounds are distinguishable with your eyes closed.
- [ ] Mute silences all three, and it survives a reload.
- [ ] Invisible mode: you vanish from the other screen within about two seconds.
- [ ] At least 25 fps with 20 cars while panning, on the car.
- [ ] The disclaimer is on every screen.
