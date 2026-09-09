# 0038. The demo clip is generated, not filmed

Status: accepted
Date: 2026-09-07

## Context

`docs/distribution.md` puts a video at the centre of the plan: "Two cars, one road, both
screens. Under thirty seconds," and everything in tiers 5 and 6 waits for it, "because
without it every post is a description of a feeling and with it the post is the feeling."

That is right about the video's job and wrong about when it can be done. The plan assumed a
filmed clip, and a filmed clip needs two drivers who have both installed this and who cross
paths — which is the very thing the app does not have yet. `/api/pulse` reads zero online.
Any clip filmed this week is two of our own devices, staged, and edited to look organic.

A screen recording that says it is a screen recording is more honest than that, not less.

There is a second reason, which is the one that will matter longer. The car drawings changed
in five of the last sixteen commits. A filmed clip is stale the moment they do, and nobody
re-shoots a road for a sprite change.

## Decision

- **`pnpm gen:demo` records the app crossing itself.** Two browser contexts, the real client,
  the real hub, the real protocol over a real socket. Only the GPS is simulated, through the
  `?e2e&sim=` mode the e2e suite already drives.
- **It is built on `e2e/two-cars.spec.ts`'s choreography**, because that is the arrangement
  already proven to produce a wave between two clients.
- **The composition is part of the code, not of an editor.** The two cars start 350 m apart,
  closing at 25 km/h: far enough to draw as two cars at the zoom the app follows at (a metre
  is about 0.42 px, so the 30 m the first version used drew both inside one sprite), and just
  outside the 300 m that raises the Wave button, so the button arrives on camera.
- **The head is trimmed to the moment both screens agree.** Recording starts when the context
  does, so without it the clip opens on two browsers booting, one half still saying "Quiet
  road. Nobody else out here right now."
- **It says what it is.** The script prints the sentence to use, and this decision is the
  reason: a demo of the app is not a claim about who is using it.
- **The output is committed**, like `gen:social`, and re-run when the drawings change.
- **The README pictures come from the same rig.** `pnpm gen:screens` shoots the car screen
  with the wave landing on it, a phone with the button up, and the screen a driver sees
  first, into `docs/images/`. A hand-taken screenshot ages exactly as badly as a filmed
  clip, and the repository's front page is the first thing anybody sees of the product.

## Rejected alternatives

- **Filming two cars now.** Not available, and what is available is a staged clip pretending
  not to be. Worth doing at a club drive, when the crossing is real and repeatable — which is
  also when the density that makes the press step worth taking exists.
- **An animation or a mockup.** Cheaper to make and worth less: it would show what we think
  the app looks like rather than what it does, and it could not catch a rendering regression.
- **Recording `/kitchen-sink`.** It renders every signature moment on demand, which is exactly
  why it is the wrong source: the moments would be posed rather than produced by two clients
  disagreeing and resolving. The bug that matters is between the halves (ADR-0031).
- **Rendering frames server-side and encoding them.** No browser, no MapLibre, no map.

## Consequences

The clip re-renders, so a rendering change can be checked against it rather than remembered.

It needs a machine that can reach the tile host: the recording still succeeds without one and
records a black map, so the script watches for failed tile requests and says so rather than
letting it be discovered on the way to a post. Behind an HTTPS proxy, Chromium has to be told
about it explicitly — it does not read `HTTPS_PROXY` — which is handled when one is set. A
proxy that re-terminates TLS can also reset the tunnel on Chromium's TLS 1.3 handshake, which
looks like a refused tile host rather than a proxy fault; the screenshot script caps the
handshake when a proxy is set, and only then.

What would make us revisit it: a real crossing worth filming. This does not replace that clip,
it fills the gap until there is one, and the two answer different questions — this one says
what the app is, and a filmed one says that people are out there doing it.
