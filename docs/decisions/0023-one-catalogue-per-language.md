# 0023. One catalogue per language, and grammar lives inside it

Status: accepted
Date: 2026-09-05

## Context

Every user-facing string was already in one file, `ui/copy.ts`, so that the voice could be
reviewed in one sitting. Adding French turned that convenience into a constraint: the app had
to speak a second language without asking anyone which one, because the driver is parked at a
car screen and the question is one more thing between them and the map.

French also breaks two assumptions English never has to state. A colour follows the model it
describes and agrees with its gender — `Model Y bleue`, but `Cybertruck bleu`. And the model
takes an article that varies: `la Model 3`, `le Cybertruck`. The old `describeCar` in the
protocol package built `blue Model Y` by taking the last word of a colour label and putting it
in front; callers then wrote `` `Wave at the ${describeCar(...)}` `` themselves.

## Decision

- **A catalogue per language**, `i18n/copy.en.ts` and `i18n/copy.fr.ts`. English is the
  contract: `Copy` is `typeof EN`, so a language that is missing a string does not compile.
- **Anything that bends with grammar is a function in the catalogue**, never a template
  assembled by the caller. Articles, plurals, the order of a colour and a noun, number
  formatting and "2 min ago" are all decided by the language that owns them. A component asks
  for `copy.wave.prompt(model, colour)` and never for the pieces.
- **Colour and model naming moved out of the protocol** into the catalogue. The protocol keeps
  ids, hexes and `describeCar` for its own English use; the app names cars per language.
- **Detection, in order**: `?lang=`, then a stored choice, then `navigator.languages`, then
  English. Arriving by a `?lang=` link is written to storage, because following one is a
  choice and losing it on the next plain visit would read as a bug.
- **One switcher**, a row in the settings sheet, each language named in its own words.

## Rejected alternatives

- **An i18n library** (i18next, FormatJS): a message-format parser and a catalogue loader for
  two languages and about 150 strings, against a 400 kB bundle budget. The second language
  cost roughly 2 kB gzipped as plain TypeScript.
- **Flat keys with interpolation placeholders** (`wave.prompt` = `"Wave at the {car}"`): the
  French article depends on the model, so the placeholder would have had to carry it, which
  is the caller assembling grammar again with extra steps.
- **Asking the driver on first run**: a language question is a screen between a parked car and
  the map, and the browser already knows the answer.
- **Keeping `describeCar` in the protocol and translating around it**: word order is not
  something a wrapper can fix.

## Consequences

Adding a language is one file plus one entry in `LOCALES`; the compiler lists what is missing.
A string that is added to English fails every other catalogue until it is translated, which is
the intended pressure.

What the compiler cannot check, a test does: `milestones` is a `Record<number, string>`, so
TypeScript would accept a language that celebrates a different set of numbers, and a list of
steps one step short renders as a list with a hole. `copy.test.ts` compares the _shape_ of
every catalogue against English, and asserts that English still names every car exactly as
`describeCar` did before this change.

The static shell (`index.html` title, description, Open Graph tags) stays English: it is built
from `brand.json`, which ADR 0001 makes the one place the brand exists, and it is what
crawlers read. Translating it means giving the brand per-language variants — worth doing when
there is a reason to rank in French, not before.
