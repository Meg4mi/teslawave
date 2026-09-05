# 0025. A driver's id is the hash of a secret only their browser holds

Status: accepted
Date: 2026-09-05

## Context

Until now the client chose its own id, a UUID from `localStorage`, and sent it in the hello
message. The hub took it at its word. Every diff broadcast to a cell carries the ids of the
cars in it, so anyone on the map could read an id and say hello with it: they would move that
driver's car, wear their nickname, and inherit their wave count. Two devices with the same id
is a feature (a phone and a car are one driver, 0008), which is exactly why the hub could not
tell an impostor from a second device.

There is no account to authenticate against (brief 2.4), and adding one is not on the table.

## Decision

The client generates a **secret** (`crypto.randomUUID`) and keeps it in `localStorage`. The
hello message carries the secret, never an id. The hub derives the public id as the first
128 bits of `SHA-256("teslawave-id:" + secret)`, and that is what everyone else sees.
Knowing an id gives nothing: becoming that driver needs the secret, and a hash does not give
it back.

Pairing hands the secret from the phone to the car instead of the id, so both derive the
same id. The pairing row is deleted the moment it is claimed rather than marked used, and
expired rows are pruned at the next daily run, so nothing holds a secret longer than the
hand-over needs.

SHA-256 is implemented in `packages/protocol/src/hash.ts` in plain TypeScript rather than
through `crypto.subtle`: the hub is a synchronous pure module with no platform access in its
tests (0013), and a hello is hashed once per connection, so speed is irrelevant. The
implementation is checked against the platform's digest across the padding boundaries.

Identities stored before this change have no secret. They are given a fresh one on load, and
therefore a fresh id: the old id was never provably theirs, and the app had been deployed for
one day.

## Rejected alternatives

- **Sign each message with a key pair.** Stronger, but it needs asynchronous WebCrypto on
  every message, and the threat is impersonation across sessions, not tampering with one.
- **Have the hub issue the id and a token on first contact, stored by the client.** The same
  shape with a server round-trip added, and the hub would have to keep a token table, which
  is storage the hub otherwise never needs (0002).
- **Keep the client-chosen id and rate-limit duplicates.** Does not distinguish a second
  device from a thief, and the second device is the feature.

## Consequences

- The wire and the pairing payload carry the secret; the privacy page says so, and says that
  what other drivers see is a hash.
- Public ids are 32 hex characters rather than UUIDs. Nothing keyed on the format.
- Wave counters stay keyed by the derived id, so a driver's count follows their secret, and a
  cleared browser loses it exactly as before.
