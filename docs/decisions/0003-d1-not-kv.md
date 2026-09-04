# 0003. D1 for the little persistence there is, never Workers KV

Status: accepted
Date: 2026-09-04

## Context

v1 needs to persist exactly three things: pairing codes (10 minute TTL, single use), daily
wave aggregates per cell, and lifetime wave counters per user. Everything else is in memory.

## Decision

Wave counters live in Durable Object storage (SQLite, debounced, changed keys only). Pairing
codes and daily aggregates live in D1.

## Rejected alternatives

- **Workers KV**: the free tier allows **1,000 writes a day**. One evening of pairing codes
  would exhaust it. KV is a read-heavy cache, not a store for anything a user creates.
- **Durable Object storage for pairing codes**: would need a lookup object keyed by code,
  which is another always-on object for no benefit, and codes are not hot data.

## Consequences

D1's free limits (5M rows read, 100k rows written per day) are far beyond what pairing and
daily aggregates need. Counter writes are debounced to 30 s and restricted to changed keys,
which keeps Durable Object row writes in the tens per day rather than the hundreds of
thousands the naive version would produce.
