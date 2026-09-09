# Press, blogs and YouTube

Tier 6, and **gated on the filmed clip**. These outlets cover browser apps when there is a
story, and the story is not the app — it is two real cars waving at each other on a real
road. There is nothing to send before that video exists, and sending anyway spends a contact
who will not answer twice.

Targets, roughly in order of how likely they are to care: Not a Tesla App, Teslascope's blog,
Teslarati, Electrek, and the YouTube channels that review in-car software.

## The pitch

Keep it short. A journalist decides from the first two lines and the clip.

**Subject:** The Tesla wave, as a live map in the car browser

> Hello — I built a free page that runs in the Tesla in-car browser and shows the other
> Teslas around you on a live map. When one comes within 300 m, a button comes up and you can
> wave; their screen says who waved and offers to wave back.
>
> The clip attached is two real cars on a real road, both screens, no staging beyond asking
> the drivers first.
>
> The things that might make it a story rather than a link:
>
> - It is the physical Tesla wave, which people already do, made into something that lands.
> - No install, no account, no app store. One page, and it moves from phone to car with a
>   six-character code.
> - Positions are never written to a database — they live in memory for a minute and are
>   gone. Only wave counts are stored. Parked cars hide themselves after ten minutes.
> - It runs on a free hosting tier and costs nothing, which is why it can stay free.
> - Open source, Apache 2.0: github.com/Meg4mi/teslawave
>
> Happy to answer anything, get you a demo, or put you in touch with drivers who have used it
> on a drive. Press images and the clip: <link>
>
> Independent project. Not affiliated with, endorsed or sponsored by Tesla, Inc. TESLA is a
> trademark of Tesla, Inc.

## What goes in the press kit

- The filmed clip, and the generated one **labelled as a screen recording**.
- `docs/images/car-screen.jpg`, `docs/images/phone.png`, `docs/images/choose.png`.
- `apps/web/public/og.png`.
- Two paragraphs from [directories.md](directories.md), the long description.
- The disclaimer, as text they can paste.

## Things to refuse

- **Any framing that reads official.** Not "the new Tesla app", not a story with the logo on
  it. Ask for the correction before publication, and check the piece when it runs.
- **Exclusives that gate the link.** The point is drivers finding it.
- **User numbers you cannot stand behind.** `/api/stats` counts waves, and that is the number
  to give. Do not convert it into "users" and do not round it upward.
- **Anything a driver did not consent to being filmed.** No plates, no faces, no home.
