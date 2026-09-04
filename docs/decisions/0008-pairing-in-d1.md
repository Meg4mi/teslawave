# 0008. Pairing codes live in D1, not in a Durable Object

Status: accepted
Date: 2026-09-04

## Context

A driver sets up on their phone, then wants the same identity on the car screen without
typing a UUID on a hostile on-screen keyboard. A six-character code, valid for ten minutes,
usable once.

## Decision

`pairing_codes` in D1: the code is the primary key, the payload is the identity, with
`expires_at` and `used_at`. Creation retries on collision. Claiming marks the row used in a
conditional `UPDATE` and returns the payload; a second claim gets a 404. Expired rows are
deleted by the daily cron. The keypad is ours, uppercase, with no ambiguous characters.

## Rejected alternatives

- **A Durable Object keyed by the code**: correct, and it makes single-use trivially atomic,
  but it is another always-on object class for data that is neither hot nor shared, and the
  object count is exactly what bounds the worst-case bill (ADR-0002).
- **Workers KV**: 1,000 writes a day on the free plan (ADR-0003).
- **A JWT in the QR code**: no server round trip, but the code has to be typeable by hand on
  the car, and six characters cannot carry a signature.

## Consequences

Single use is enforced by `UPDATE ... WHERE used_at IS NULL` and the affected-row count, so
two cars racing on the same code cannot both win. A per-isolate limit of ten claims a minute
per IP keeps brute force uninteresting against a 32^6 space (about a billion codes) where
each code lives ten minutes.
