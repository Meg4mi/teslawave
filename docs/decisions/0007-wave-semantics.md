# 0007. Wave semantics: both parties, 150 m to prompt, 300 m to accept, milestones not ranks

Status: accepted
Date: 2026-09-04

## Context

The wave is the product. It has to feel immediate while driving, it has to be hard to abuse,
and the brief explicitly rules out leaderboards and ranking.

## Decision

- The button appears when another car is within **150 m**; the server accepts a wave within
  **300 m**. The gap is twice the maximum fuzz (100 m each side) plus margin, so a wave the
  client offers is one the server will accept.
- Proximity on the client is measured **between fuzzed positions**, the same data the server
  validates against. The raw fix is used only to draw your own car.
- A wave counts **for both** parties. There is no sender and receiver in a nod between owners.
- Two waves within 4 s read as a **wave back**, with its own copy and its own beat.
- Personal **milestones** at 1, 5, 10, 25, 50 and 100 waves, stored in `localStorage`, with
  no comparison to anyone else. Raised from the event that caused them, not from an effect
  watching the counter, so each fires exactly once.
- Rate limit: one wave per 5 s per socket, validated server-side.

## Rejected alternatives

- **A leaderboard**: ruled out by the brief, and it would change who the product attracts.
- **Prompting and validating at the same distance**: the fuzz makes the client's view and
  the server's view differ by up to 100 m, so the button would sometimes offer a wave the
  server then refuses. Offering something that fails is worse than offering it slightly less
  often.
- **Counting a wave only for the sender**: makes receiving passive, and the whole point is
  that both drivers were there.

## Consequences

Waves are cheap: about 5,000 a day at launch volume is 250 request-equivalents. Counters are
kept in memory and written to Durable Object storage only when they change, at most every
30 s.
