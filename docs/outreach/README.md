# The outreach pack

[docs/distribution.md](../distribution.md) decides _where_ to post and _in what order_.
This is the copy to paste when you get there, written once so that a post is never drafted
in the moment, in the wrong voice, with a claim nobody checked.

Everything here is a draft to edit, not a script to send unread. Say what is true on the day.

## The rules, short

From distribution.md, and they are not preferences:

- **A car screen first.** `docs/images/car-screen.jpg`, or the card. Never a phone screenshot
  of a map with one car on it.
- **Phone first, then the car.** Never "open it in your car". The address is not typeable on
  a car screen worth the trouble; the six-character code is why pairing exists.
- **The disclaimer** in the post, or plainly visible in the image.
- **No exclamation marks.** The copy is the copy.
- **The plain word Tesla only.** No logo, no "T", no "Tesla app", nothing that reads official.
- **No UTM parameters** on anything pasted into a group. They get forwarded, and they look
  like tracking because they are.
- **`?lang=fr`** for French-speaking groups. The app follows the car anyway; a link that
  lands right is a better first impression.

## What is true, and what is not

Check this before every post. The temptation in outreach is always one adjective past what
was measured.

| Claim                                                             | Status                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Free, no account, nothing to install                              | True                                                                                                                                                                                                                                                                                                         |
| Runs in the Tesla in-car browser                                  | True, and it has been driven on a real car screen                                                                                                                                                                                                                                                            |
| Runs on a Model Y (Juniper)                                       | True — [tesla-notes.md](../tesla-notes.md), 2026-09-09. This is the only model that may be named                                                                                                                                                                                                             |
| Positions are never written to a database                         | True — they live in memory for 60 s, only wave counts are stored                                                                                                                                                                                                                                             |
| Hidden after 10 minutes parked; invisible mode within two seconds | True                                                                                                                                                                                                                                                                                                         |
| The wave button appears within 300 m                              | True (the hub accepts to 450 m)                                                                                                                                                                                                                                                                              |
| Open source, Apache 2.0                                           | True — github.com/Meg4mi/teslawave                                                                                                                                                                                                                                                                           |
| English and French                                                | True, and only those two                                                                                                                                                                                                                                                                                     |
| **"Runs on a 2019 Model 3 / MCU 2"**                              | **Do not say this.** Both MCU rows in [tesla-notes.md](../tesla-notes.md) are still `_pending_`. A Juniper is an AMD unit and says nothing about the Intel Atom in MCU 2, which is the hardware the whole renderer was built for. Name the Juniper, or say "a real Tesla screen"; never imply the older cars |
| **"Smooth on any Tesla" / "works on all models"**                 | **Do not say this.** One modern car is one data point. An owner on MCU 2 who is told it works and finds otherwise is the review that sticks                                                                                                                                                                  |
| **"Positions are blurred"**                                       | **Do not say this.** The fuzz was removed in ADR-0024. Exact positions are sent, with consent, and never stored. Saying otherwise is a privacy claim that is now false                                                                                                                                       |
| **A busy map**                                                    | Do not imply it. `/api/stats` is the honest number, and it is small                                                                                                                                                                                                                                          |

## The state of each channel

| Tier | Channel                                     | File                                         | State                                                                                                    |
| ---- | ------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1    | Regional owner groups                       | [owner-groups.md](owner-groups.md)           | Ready                                                                                                    |
| 1    | French-speaking community (BlogTesla forum) | [french-community.md](french-community.md)   | Ready — the densest French room, with a section for exactly this                                         |
| 2    | Tesla Owners Clubs                          | [clubs.md](clubs.md)                         | Ready                                                                                                    |
| 3    | Tesla Motors Club                           | [tesla-motors-club.md](tesla-motors-club.md) | Ready                                                                                                    |
| 4    | In-car browser directories                  | [directories.md](directories.md)             | tesda.sh live. Cheap and durable, but lower reach than the tier order implies — see the note in the file |
| 5    | Reddit                                      | [reddit.md](reddit.md)                       | Gated on the filmed clip                                                                                 |
| 6    | Press, blogs and newsletters                | [press.md](press.md)                         | Ready with the generated clip, labelled as a screen recording. Better again once the filmed one exists   |
| 7    | Hacker News                                 | [hacker-news.md](hacker-news.md)             | Gated on density somewhere                                                                               |

Tier 5 is gated on purpose: a maker post without the clip is a description of a feeling, and
a subreddit is spent the first time. Tier 7 is gated on density, so the map is not empty for
the people who click. Tier 6 is no longer gated — the news sites cover browser apps as a
matter of course, and the generated clip answers "what is this" well enough to pitch on, as
long as it is labelled a screen recording every time ([press.md](press.md)).

## The assets

| What             | Where                                                             |
| ---------------- | ----------------------------------------------------------------- |
| Car screen photo | `docs/images/car-screen.jpg`                                      |
| Phone screenshot | `docs/images/phone.png`                                           |
| First screen     | `docs/images/choose.png`                                          |
| Share card       | `apps/web/public/og.png`, or live at https://teslawave.app/og.png |
| Generated clip   | `pnpm gen:demo` → `public/demo/demo.mp4`                          |

The generated clip is a screen recording of the app crossing itself, and every post carrying
it says so (ADR-0038). It answers "what is this". It cannot answer "are people really out
there", which is the question the press and the clubs are asking, and it must never be
dressed as footage from a road.

## Before you paste

1. Re-read the ledger above.
2. Open https://teslawave.app on a phone and check it is up.
3. Check the channel's own self-promotion rule. Most want a maker post, not a link drop.
4. One place, done well. Not ten in an afternoon.
