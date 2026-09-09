# Tesla Motors Club

Tier 3, and the most durable thing on the list: the browser-apps wiki thread is found by
people for years afterwards. One honest post in the software subforum, then the wiki entry.

Both threads to land in:

- [Definitive List of Tesla Friendly Browser Apps/Pages](https://teslamotorsclub.com/tmc/threads/definitive-list-of-tesla-friendly-browser-apps-pages.66688/)
- [Useful browser websites while driving](https://teslamotorsclub.com/tmc/threads/useful-browser-websites-while-driving.181669/)

Read the forum's self-promotion rule before posting, and post as a member who built a thing,
because that is what this is.

## The post

**Title:** A live map of the Teslas around you, in the car browser — free, no account

**Body:**

> I built a page that runs in the car's browser and shows the other Teslas around you on a
> live map. When one of them comes within 300 m, a button comes up: wave. Their screen says
> who waved and offers to wave back. That is the whole thing.
>
> **Getting it onto the car.** Set it up on your phone first at teslawave.app — pick a model
> and a paint colour, no sign-up — then tap "Use this on my car" and it gives you a six
> character code. On the car screen open the same address, tap "I already set this up on my
> phone", and type the code. Your name, car and wave count come across. You can also just
> open it on the car directly, but typing the address on that keyboard is its own punishment.
>
> **What it does with your position.** It is sent while you are visible and moving, held in
> memory for a minute so the cars around you can be drawn, and never written to a database.
> The only thing stored is wave counts as numbers. A car parked for ten minutes is hidden
> until it moves, so nobody can watch where you stop, and invisible mode drops you off every
> screen in about two seconds. No account, no email, no trip history, no cookies.
>
> **How it behaves on the car screen.** It is built for that browser rather than ported to
> it: the map redraws at the frame rate the screen can actually manage and steps down on its
> own when frames run long, other cars are interpolated between updates so they glide rather
> than jump every couple of seconds, and there are zoom buttons because pinching while
> driving is a poor gesture. Several rounds of fixes in it came from a real car screen —
> pinch, the camera on turns, cars blinking at cell boundaries — and there is a file of those
> findings in the repo.
>
> **What it needs.** It only works when two people who have it cross paths, and there are not
> many of us yet. So it will be an empty map on a quiet Tuesday afternoon, and I would rather say so
> here than have you find out. If it interests you, the useful thing is having it open on a
> regular commute in a region where somebody else does too.
>
> Free, open source under Apache 2.0, and it costs me nothing to run:
> github.com/Meg4mi/teslawave
>
> English and French. Feedback from a real car is worth more to me than anything else, and
> there is an issue form for exactly that.
>
> Independent project. Not affiliated with, endorsed or sponsored by Tesla, Inc.
> TESLA is a trademark of Tesla, Inc.

Attach `docs/images/car-screen.jpg` as the first image.

## The wiki entry

Keep it to the line the list's format wants:

> **[TeslaWave](https://teslawave.app)** — live map of the Teslas around you, with a wave
> button when one comes within 300 m. Free, no account, nothing stored. Set up on the phone
> and moved to the car with a code. English and French. Independent project, not affiliated
> with Tesla, Inc.

## Answering the three questions that will come

**"Does it drain the battery / use data?"** It is a web page with a map on it, so it uses
what a map uses. It sends your position at most every couple of seconds while moving and
every thirty seconds when stopped, and the map tiles are cached by the browser.

**"Who is behind it and what is the catch?"** Independent, one person, open source, no ads,
no tracking, no account. It runs on a free hosting tier, which is the reason it can stay free
rather than a promise that it will always exist.

**"What stops someone tracking me?"** Nothing is stored, so there is no history to obtain.
While you are visible, drivers near you see where you are — that is the product, and it is
opt-in every time. Parked cars are hidden after ten minutes, and invisible mode is one tap.
The privacy page in the app says all of it in plain words.
