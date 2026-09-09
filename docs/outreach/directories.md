# In-car browser app directories

Tier 4. These are the launcher pages drivers bookmark on the car screen, so a listing is a
bookmark in every car that uses one. Unglamorous and durable, and the only channel where the
driver is already sitting in the car when they find you.

## Where it stands

| Directory                                                                  | State                                                        |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [tesda.sh](https://tesda.sh/)                                              | **Listed** — submitted by pull request, merged 2026-09-09    |
| [codriver.io](https://codriver.io/guides/tesla-browser-summer-2026-update) | To submit — keeps a browser-apps guide                       |
| [fullscreentesla.com](https://www.fullscreentesla.com/)                    | To submit — a launcher page of the same kind as tesda.sh     |
| [technologybloggers.org/t](https://www.technologybloggers.org/t/)          | To submit — a "Web Apps for Teslas" list                     |
| [teslatuneup.com](https://teslatuneup.com/tesla-browser-apps/)             | To pitch — a listicle rather than a list, so closer to press |
| [tesletter.com](https://tesletter.com/tags/tesla-browser/)                 | To pitch — a newsletter that covers browser apps             |
| Other launcher pages and "Tesla browser apps" lists                        | To submit as found                                           |

When a listing goes live, add the row here rather than remembering it.

**What these are worth, honestly.** Less than the tier order suggests. Several of these pages
are self-hosted dashboards — a driver deploys their own copy — so a listing reaches whoever
installs it rather than everyone who visits, and some of the lists have not been touched in a
long time. The cost of a submission is near zero and a listing is durable, so they stay on the
list; they are just not the channel to spend a week on. The news sites in
[press.md](press.md) reach more owners in one piece than all of these together, and the
forum in [french-community.md](french-community.md) reaches the ones who will actually
drive with it.

Two things about the car's browser worth knowing before writing to any of these, because
they date quickly and a submission that gets them wrong reads as someone who does not own
the car. The 2026.26 update moved the browser to a current Chromium and changed the screen's
pixel density — which is why nothing in this client may hardcode a screen size, and why
`check:css` fails a build that does. And since 2026.20 an owner can block the browser
entirely from the car's settings, so "open this in your car" is not universally possible,
which is one more reason the phone-first route is the one to describe.

## The canonical entry

Copy from here rather than rewriting per site, so the wording stays the same everywhere it
appears. All of it is checked against the ledger in [README.md](README.md).

| Field       | Value                                            |
| ----------- | ------------------------------------------------ |
| Name        | TeslaWave                                        |
| URL         | https://teslawave.app                            |
| Category    | Maps / social / driving                          |
| Price       | Free                                             |
| Account     | None                                             |
| Languages   | English, French                                  |
| Source      | https://github.com/Meg4mi/teslawave (Apache 2.0) |
| Contact     | contact@teslawave.app                            |
| Icon        | `apps/web/public/icon.svg`                       |
| Screenshot  | `docs/images/car-screen.jpg`                     |
| Share image | https://teslawave.app/og.png                     |

**One line (under 100 characters):**

> A live map of the Teslas around you, with a wave button when one comes close.

**Short (under 300 characters):**

> See the Teslas around you on a live map and wave at the ones that come within 300 m. Their
> screen says who waved and offers to wave back. Free, no account, nothing to install, and
> your position is never stored. Independent project, not affiliated with Tesla, Inc.

**Long:**

> TeslaWave shows the other Teslas around you on a live map in the car's browser. When one
> comes within 300 m a button rises: wave. The other driver's screen says who waved and
> offers to wave back.
>
> There is nothing to install and no account. Pick a model and a paint colour and go. It is
> easiest to set up on your phone and move it to the car with a six-character code, so you
> never type the address on the car keyboard.
>
> Your position is used only to draw you for the drivers near you. It is held in memory for a
> minute and never written to a database; the only thing stored is wave counts as numbers. A
> car parked for ten minutes is hidden until it moves, and invisible mode takes you off every
> screen in about two seconds. No trip history, no advertising, no cookies.
>
> Built for the car screen rather than ported to it, in English and French, open source under
> Apache 2.0.
>
> Independent project. Not affiliated with, endorsed or sponsored by Tesla, Inc. TESLA is a
> trademark of Tesla, Inc.

## Submitting

Most of these lists are a GitHub repository or a form. Where it is a repository, a pull
request is the whole submission: match the file's existing shape exactly, add one entry, and
change nothing else in the diff. Where it is a form, paste from the table above.

The note to include with a submission, whatever the format:

> Free, no account, nothing to install. Works in the car browser; easiest to set up on the
> phone and move across with a code. Positions are never stored. Independent project, not
> affiliated with Tesla, Inc.

## Keeping a listing honest

A listing outlives the page it points at, which is the reason it is valuable and the reason
it is a liability. If any of these change, the entries above are wrong and every directory
needs the correction sent:

- the address,
- what is stored,
- the languages,
- whether it is free.
