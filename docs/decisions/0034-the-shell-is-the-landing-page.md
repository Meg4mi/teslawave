# 0034. The shell is the landing page, and the social image is the share card

Status: accepted
Date: 2026-09-07

## Context

The landing page and the app are one route (brief 4.1), rendered by React after the bundle
arrives. Until then the document was `<div id="root"></div>`: a crawler, a link unfurler
and a driver on LTE all got an empty page with a good title. Search engines do run
JavaScript, eventually, but a link pasted into a WhatsApp group — which is where this app
will mostly be discovered — is unfurled by a bot that does not, and the preview it built was
a title over a picture of three rings with no car on it and no words.

Meanwhile the app already draws a card with a car and a count on it to be sent to exactly
those groups (ADR-0032), from the same drawing as the map (ADR-0020).

## Decision

**The static shell in `index.html` is real content.** The brand, the tagline, the
description, three lines on how it works, the privacy link and the disclaimer, styled inline
so they paint before any stylesheet, and replaced by the app the moment it mounts. It is not
hidden and not for crawlers only: it is what the first paint looks like now, instead of a
black rectangle. No prerendering step and no server rendering: the Worker never sees a page
request (ADR-0030), and a build step that renders React to HTML would be a second renderer
to keep honest for one screen.

**Everything a crawler asks for by name comes from `brand.json`.** The canonical URL, the
Open Graph and Twitter tags, the JSON-LD data block, `robots.txt`, `sitemap.xml` and the web
manifest are all written by the Vite plugin from the one brand file, so a rebrand stays a
one-file change and the sitemap cannot name a domain the page does not. The JSON-LD is a
data block, never executed, so the CSP's `script-src 'self'` does not apply to it.

**The social image is the share card.** `/og` (development only, like `/art`) draws the
card with the product's words instead of a count, and `pnpm gen:social` screenshots it at
the size the meta tags promise, then writes the PNG icons from the same SVG as the favicon.
The result is committed: nothing runs at build time, so a build machine without a browser
is not a failed build. The generator embeds Inter for the text because a build machine's
system font is not the car's; the app itself still uses the system stack.

**Titles follow the language at runtime.** The catalogue gains a `seo` entry, so a French
screen's tab and bookmark are in French, and the privacy page names itself. The HTML keeps
the English ones for anything that runs no script. One URL serves both languages, so the
alternates are `?lang=` links (i18n/locale.ts), which is what the hreflang tags say.

## Rejected alternatives

- **Server-side rendering or a prerender step.** Assets must not reach the Worker
  (ADR-0002, ADR-0030), and a prerender is a second render path for one static screen. The
  shell is forty lines of HTML that say the same thing.
- **Hidden text for crawlers.** Indistinguishable from cloaking, and the shell is better
  visible anyway: it is the first paint.
- **Drawing the OG image in Node without a browser.** The card is a canvas drawing that
  shares code with the map; reimplementing it as raw PNG bytes (the old generator) is how it
  came to have no car on it.
- **A separate marketing page.** The brief is explicit that landing and app are the same
  route, and the pulse line on the first screen is the only honest marketing there is.

## Consequences

- `pnpm gen:social` must be re-run when the card drawing, the tagline or the icon changes;
  it needs a Chromium (`CHROMIUM_PATH` names one Playwright did not install).
- An unknown path still answers 200 with the app (a mistyped bookmark on the car must
  work), but now carries `<meta name="robots" content="noindex">` so it is not indexed.
- The shell flashes for as long as the bundle takes to arrive, then the onboarding replaces
  it. On a car that is well under a second; on LTE it is the difference between a page and
  a black screen.
