# 0037. Terms, a safety line, and somebody to write to

Status: accepted
Date: 2026-09-07

## Context

The app was ready to be shared widely — the plan in `docs/distribution.md` runs from regional
owner groups through to the Tesla news sites — and three things were missing that only matter
once strangers arrive.

The first is the one that matters most: this is an app whose entire premise is that a driver
looks at a screen and taps it while driving a car. There was no safety wording anywhere in the
product. Not in `copy.en.ts`, not in onboarding, nowhere. Distracted-driving rules differ by
country and, in the United States, by state, and a project that ships to all of them cannot
name a single rule that is correct everywhere.

The second is that there were no terms at all. A free thing with no account still needs to say
that it comes with no warranty and that its authors are not liable for what happens on a road.

The third is that `docs/privacy.md` was substantively good — better than most — and named
nobody. GDPR Article 13 wants the identity of the controller and a way to reach them. There
was no name, no address, and nowhere for a data protection authority to write.

## Decision

- **A safety line on the first screen**, beside the privacy line, above Go. That is where the
  driver agrees to be seen, and the only moment the app can be sure the car is stopped.
- **The line defers rather than legislates.** "Where the law says a screen is not touched while
  moving, it is not." This project cannot know which of fifty states or forty countries a
  driver is in, and a specific rule stated wrongly is worse than a general one stated honestly.
- **A `/terms` route**, built exactly like `/privacy`: same component shape, same materials,
  every word from the catalogue. **Driving is its first section**, because it is the only
  section that can prevent harm; warranty, liability, independence and changes follow.
- **A `contact` field in `brand.json`**, on the brand's own domain rather than a personal
  mailbox, and a controller paragraph on the privacy page that names who runs this and how to
  write to them. It says "an independent project rather than a company, run by the person who
  built it", which is true, and leaves the legal name to whoever is prepared to sign it.
- **Both pages in both languages**, which the shape test in `copy.test.ts` enforces anyway.
- Both are linked from the static shell in `index.html`, so a crawler and a driver on LTE see
  them before the bundle arrives (ADR-0034), and both are in the sitemap.

## Rejected alternatives

- **A modal to dismiss before Go.** A screen between a parked car and the map, which ADR-0023
  already refused for the language question. It also converts a promise into a click, and the
  click is worth less than the sentence.
- **Naming a jurisdiction and a governing law.** Every draft required inventing where the
  project is established, and an invented answer to that question is worse than no clause.
  Left out deliberately; add it when there is a name to put on it.
- **Naming a specific rule** ("do not use while driving in California"): wrong the moment the
  car crosses a state line, and it invites the reader to believe the list is complete.
- **A personal email address.** It is printed on a public page that anybody can read, and an
  inbox outlives the person who owns it less reliably than a domain does.
- **Terms as a Markdown file in `docs/`.** Nobody driving a car reads the repository, and a
  document that only the author can find is not a term anybody agreed to.

## Consequences

`brand.json` gains a field, so a rebrand still stays one file. Two documents now have to be
kept true in two languages, which the catalogue shape test makes loud rather than silent.

The safety line is the one piece of copy in the app that exists for a reason other than the
driver's pleasure, and it should keep that tone: it is not a warning banner, and it should
never grow into one.

What would make us revisit it: a legal name to put on the controller line, a jurisdiction
worth naming, or a country whose rules require a specific form of words this general one does
not satisfy.
