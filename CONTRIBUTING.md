# Contributing to TeslaWave

The product only works when two people who have it cross paths, so the most valuable thing
anybody can do is drive with it and say what happened. A row in
[docs/tesla-notes.md](docs/tesla-notes.md) from a real car is worth more than most patches:
CI has no GPU, and that file and the performance beacon are the only real performance data
that exist.

## The licence

TeslaWave is Apache License 2.0. There is no CLA to sign: under section 5 of the licence,
anything you deliberately submit for inclusion is contributed under those same terms, and
you keep the copyright in what you wrote.

Section 6 withholds trademark rights on purpose. Fork the code freely; do not ship it under
the TeslaWave name.

## Before you open a pull request

Everything CI runs, you can run:

```bash
pnpm lint        # the worker rules are cost invariants, not style
pnpm typecheck
pnpm test
pnpm build
pnpm check:css   # rendering budget
pnpm check:size  # bundle budget
```

The browser suite is heavier and runs nightly, on pull requests that touch the rendering
path, and on demand:

```bash
pnpm test:e2e
```

[README.md](README.md) covers getting it running, and `pnpm sim` fills an empty map with
simulated drivers so there is something to look at.

## The five rules that are not style

The whole thing is meant to run on Cloudflare's free plan, where exceeding a limit causes an
error rather than a bill. That only holds while the hub stays eligible for hibernation, so
ESLint enforces these on `apps/worker/src/**` and the tests enforce them again:

1. No `setTimeout`, `setInterval` or alarms in the hub. Arriving messages drive the tick.
2. Sockets are accepted with `ctx.acceptWebSocket()`, never `ws.accept()`.
3. No `fetch` and no D1 from a message handler.
4. Positions are never persisted. Counter writes are debounced and limited to changed keys.
5. The hub id is validated at the edge, so at most 1,024 Durable Objects can ever exist.

Breaking (1) or (2) bills every object with a connected driver around the clock — roughly
$800 a month for a couple of hundred objects. If a change seems to need one of these, that
is the conversation to open first, before the patch. The numbers are in
[ADR-0002](docs/decisions/0002-hub-durable-object-and-cost-model.md).

## Changing the protocol

Every bug found on a real car screen so far has been an ordering bug *between* the hub and
the client, invisible from inside either half. So a protocol change is proved in
`apps/web/src/sim/roundtrip.test.ts` first, which runs the real hub against the real client
on a virtual clock — drops, hibernation wakes, cell crossings ([ADR-0031](docs/decisions/0031-the-two-halves-are-tested-against-each-other.md)).

Bump `PROTOCOL_VERSION` when a change would make an old client and a new hub disagree. A
Tesla is pinned to a tab for weeks, and the version handshake is the only way a build in the
field is ever replaced ([ADR-0029](docs/decisions/0029-protocol-version-and-remote-reload.md)).

Re-run `pnpm bench` after touching `flushIfDue`; it prints the table the socket caps are set
from.

## Copy and languages

All user-visible words come from the catalogue in `apps/web/src/i18n/`, one file per
language ([ADR-0023](docs/decisions/0023-one-catalogue-per-language.md)). A new string lands
in `copy.en.ts` and `copy.fr.ts` together — the shape test in `copy.test.ts` fails loudly
otherwise. No exclamation marks.

## Someone else's trademark

Never the Tesla logo, never the "T", never anything that looks official. The disclaimer
belongs on every surface, including generated images. The car drawings are authored geometry
rather than traced photographs, deliberately, so that they are ours to license
([ADR-0018](docs/decisions/0018-traced-model-art.md), [ADR-0020](docs/decisions/0020-one-car-drawing-two-renderers.md));
keep it that way.

## Decisions get written down

[docs/decisions](docs/decisions) has one file per non-obvious decision, written as it was
made, including the alternatives that were rejected and what would make us revisit it. If
your change turns on a judgement call that the next person would otherwise have to
reconstruct from the diff, add one — [0000-template.md](docs/decisions/0000-template.md) is
the shape.

Small, obvious fixes need no ceremony. Open the pull request.
