# Getting TeslaWave in front of drivers

The product only works when two people who have it cross paths. That single fact decides
everything below: reach is worth nothing spread thin, and worth a great deal concentrated.
The likeliest way this dies is a driver opening it on a quiet Tuesday and concluding nobody
uses it (ADR-0032). So the plan is not "get users", it is "get density in one place, then
the next".

This file decides where to post and in what order. The copy to paste when you get there —
per channel, in English and French, with a ledger of what may and may not be claimed — is in
[docs/outreach](outreach/README.md).

## What we are working with

- **A link, not an install.** No store listing, no review, no update lag: `teslawave.app`
  is the whole onboarding. This is the biggest advantage and the biggest constraint at the
  same time, because there is no store to be discovered in.
- **The car screen has no address bar worth typing on.** A driver hears about this on their
  phone and has to get it into the car. The pairing flow (phone first, then a six-character
  code on the car) exists for that. Every piece of outreach should say _set it up on your
  phone, then use the code on the car_, and never "open it in your car".
- **What travels in an owner group is a picture.** The share card (car, wave count, the
  domain) is drawn on the client and sent from the phone with the address attached. The
  link itself unfurls into the same kind of image (`og.png`, ADR-0034), so a pasted URL
  does not look like a bare URL.
- **A free tier that fails closed.** A viral day is the day the app must not go dark. The
  landing page costs no Durable Object request per visit (the pulse is cached per cell,
  ADR-0032), so page views are free; sockets are not. Watch `pnpm usage` the morning after
  any push.
- **Someone else's trademark.** Never the logo, never the "T", the disclaimer on every
  surface, including every image. Outreach copy says "independent" early. This also rules
  out anything that looks official: no "Tesla app", no Tesla branding in a post title.

## Where drivers actually are

In rough order of how much a single post there is worth:

1. **Regional owner groups on WhatsApp, Telegram and Facebook.** These are where density
   lives: a group is a city or a region, which is exactly the unit the app needs. A
   message with the card, a sentence, and "set it up on your phone, then on the car" is
   the whole pitch. Start with the groups the people on this project are already in.
2. **Tesla Owners Clubs.** The official club network is regional, active and runs drives
   and meetups. A club drive is the ideal launch moment: a dozen cars on the same road,
   every one of them crossing every other, every one of them getting the wave that makes
   the product click. Offer it as _the thing to run during the drive_, not a pitch.
3. **Tesla Motors Club.** It keeps a wiki thread of browser-friendly pages and apps
   ([Definitive List of Tesla Friendly Browser Apps/Pages](https://teslamotorsclub.com/tmc/threads/definitive-list-of-tesla-friendly-browser-apps-pages.66688/))
   and a thread on
   [useful browser websites while driving](https://teslamotorsclub.com/tmc/threads/useful-browser-websites-while-driving.181669/).
   Being on that list is durable: people find it for years. One honest post in the
   software subforum, then the wiki entry.
4. **In-car browser app directories.** [Tesdash](https://tesda.sh/) and similar launcher
   pages are what drivers bookmark on the car screen; a listing there is a bookmark in
   every car that uses it. **Tesdash is live as of 2026-09-09**, by pull request. Still
   worth a pull request or a form wherever
   [codriver.io](https://codriver.io/guides/tesla-browser-summer-2026-update) and its
   peers keep their lists ([outreach/directories.md](outreach/directories.md)). It is also
   the one channel that inverts the phone-first rule: a driver clicking a launcher page is
   already sitting in the car, so they arrive on the car screen with no phone step, and that
   is the arrival to keep an eye on.
5. **Reddit.** r/TeslaLounge, r/TeslaModel3, r/TeslaModelY and r/teslamotors, plus the
   regional ones (r/TeslaUK, r/TeslaCanada and so on). Read each subreddit's
   self-promotion rule first; most want a maker post that shows the thing rather than a
   link drop. The story that lands: _"I built the Tesla wave as a live map, it runs in the
   car browser, free, no account, positions never stored"_. Lead with the screenshot on a
   car screen, not the phone. Name no model or MCU until a row in
   [tesla-notes.md](tesla-notes.md) says one was actually driven: both are still `_pending_`,
   and the one claim a forum of owners will check is the one about their own hardware.
6. **The Tesla news and tips sites.** Not a Tesla App, Teslascope's blog, Electrek,
   Teslarati, and the YouTube channels that review in-car software. They cover browser
   apps when there is a story: a short video of two real cars waving at each other on a
   real road is the story. Nothing to send before that video exists.
7. **Hacker News, as a technical post.** This one is not for drivers, it is for the
   next contributor and for credibility: a live map on Cloudflare's free tier, hibernating
   Durable Objects, one drawing rendered two ways, running on an Intel Atom. Show HN with
   the README as the pitch. Do it once density exists somewhere, so the map is not empty
   for the people who click.

Product Hunt is low on this list on purpose: its audience is not drivers, and a launch
day of curious non-owners is a day of sockets from people who will never wave.

## The order

**Week one: one region.** Pick the region where the people on this project drive, and
where a club drive can be arranged. Every post above, for that region only. Aim for
enough drivers that a commute has a real chance of a crossing; the pulse line on the
first screen ("9 drivers out there right now") is the number to watch, and it is honest
by design.

**Then the video.** Two cars, one road, both screens. Under thirty seconds. Everything in
tiers 5 and 6 waits for this, because without it every post is a description of a feeling
and with it the post is the feeling.

That is the filmed clip, and it needs two drivers who both have this and who cross paths —
so it is gated on the same density the press step is gated on, and a club drive is where it
gets made. Until then `pnpm gen:demo` records the app crossing itself: the real client, the
real hub, only the GPS simulated (ADR-0038). The two are not substitutes. The generated one
answers "what is this", and belongs on the landing page, in the how-to, in a maker post, in
the TMC thread and in a directory listing. The filmed one answers "are people really out
there doing this", which is the question the press and the clubs are actually asking, and
nothing generated can answer it. Post the generated clip as what it is — a screen recording
— and never dressed as footage from a road.

**Then the next region**, using the first as proof. A region launches when a group or a
club there is willing to run a drive; if none is, the region is not ready.

For a French-speaking region the map of all this is drawn in
[outreach/french-community.md](outreach/french-community.md), and it inverts the obvious
guess: Tesla Owners Club France is nearly dormant, while the BlogTesla forum carries ~395,000
messages and has a section for Tesla applications. The official body is the wrong first post
and the active forum is the right one.

Where there is no club to ask, the drive is proposed in the owner group instead — three cars
and a date is the same thing, and [outreach/clubs.md](outreach/clubs.md) has the fallbacks.
Note which one a Supercharger is: the best place to put the link on somebody's phone, and the
worst place to show them the map, because a car stopped for ten minutes is hidden until it
moves (ADR-0026).

## What a post contains

- The card or a car-screen screenshot, first. Never a phone screenshot of a map with one
  car on it.
- One sentence on what it is, one on how to get it into the car (phone first, then the
  code), one on privacy (never stored, hidden when parked, invisible in one tap).
- The disclaimer, in the post or visibly in the image.
- A `?lang=fr` link for French-speaking groups; the app follows the car's language anyway,
  but a link that lands in the right language is a better first impression.
- No exclamation marks. The copy is the copy.

## Measuring it without tracking anyone

Cloudflare Web Analytics (set `VITE_CF_BEACON_TOKEN` at build time) shows referrers and
page views without cookies, which is enough to tell which channel sent people. Do not add
UTM parameters to links shared into groups: they get pasted onward and look like tracking,
because they are. The number that matters is not visits anyway, it is `/api/stats` — waves
exchanged — and the per-cell counts the nightly harvest already keeps. A region is working
when its wave count is not zero on weekdays.

## What not to do

- No paid acquisition. The product has no revenue and a spend would buy visitors, not
  density.
- No bots, no simulated cars on the live map, no inflated counters. The whole product is
  that the other cars are real.
- No posting the same thing in ten subreddits in one afternoon. One place, done well,
  then the next.
- No Tesla trademark in any image, handle or post title beyond the plain word, with the
  disclaimer.
