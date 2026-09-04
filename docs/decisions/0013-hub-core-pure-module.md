# 0013. Hub logic as a pure, portable module

Status: accepted
Date: 2026-09-04

## Context

The cost invariants in 0002 are properties of the code, so they have to be testable, and
testing them through workerd for every case is slow. Cloudflare is also the one hard
dependency of the whole project.

## Decision

All hub logic lives in `packages/hub-core`: plain TypeScript, no Cloudflare imports. State is
a plain object; handlers return a list of effects (`send`, `close`, `attach`, `persist`) that
the Durable Object executes. `apps/worker/src/hub-do.ts` is a thin adapter.

## Rejected alternatives

- **Logic inside the Durable Object class**: every test needs workerd, and the invariants
  ("never persists a position", "one diff per cell per tick") become integration tests.

## Consequences

Rate limits, capacity, wave validation, expiry, counter debouncing and the fan-out budget are
unit-tested in milliseconds. Moving to any other WebSocket server means writing a new adapter,
not a new hub. The Durable Object tests can then focus on what only workerd can prove:
hibernation acceptance, attachments, and real socket behaviour.
