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
      button rises with a countdown hairline running out along its bottom edge.
- [ ] **Wave sent** — press compresses, three rings leave your car, the button collapses into
      a dot that flies to the other car, and the sent chime plays.
- [ ] **Wave received** — warm rings on the sender, a toast carrying their actual sprite, the
      counter rolls up with a warm halo, and a chime that is audibly different from "sent".
- [ ] **Waved back** — both within four seconds reads as its own beat, with its own copy.

## The rest

- [ ] Milestone card at wave 1, and it is personal: no ranking, no comparison.
- [ ] Trails visible and fading; traffic reads as light painting from above.
- [ ] HUD legible over both dark ground and a bright motorway.
- [ ] Roads, water and labels are all clearly visible on the map, at the floors in ADR-0006.
      A dark map is the point; an invisible one is a bug.
- [ ] Every control says what it does without hovering, because a car screen has no hover.
- [ ] All five car sprites are distinguishable from each other, and which way each one points
      is obvious at a glance.
- [ ] Empty state is honest and inviting, not a spinner.
- [ ] Nothing interactive within 40 px of any screen edge; every target at least 64 px.
- [ ] Sent, received and milestone sounds are distinguishable with your eyes closed.
- [ ] Mute silences all three, and it survives a reload.
- [ ] Invisible mode: you vanish from the other screen within about two seconds.
- [ ] At least 25 fps with 20 cars while panning, on the car.
- [ ] The disclaimer is on every screen.
