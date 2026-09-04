# 0010. No service worker in v1

Status: accepted
Date: 2026-09-04

## Context

A service worker would let the shell load instantly on a flaky connection, which is tempting
for a car that pulls out of an underground car park.

## Decision

No service worker in v1. A web app manifest, yes, so the app can be pinned; a cache that
serves stale code, no.

## Rejected alternatives

- **Cache-first shell**: the failure mode is a Tesla pinned to a tab, running a build from
  three weeks ago, talking a protocol the hub has moved past. Recovering that remotely means
  asking owners to clear site data on a car screen.
- **Network-first with a cache fallback**: most of the benefit needs the cache to be trusted,
  which is the part we do not want.

## Consequences

Cold start depends on the network, which the bundle budget already targets (110 kB gzipped
excluding MapLibre). Revisit when the protocol has been stable for a while and there is a
version handshake that can force a reload.
