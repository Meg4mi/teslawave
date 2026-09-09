# Security and privacy reports

Please report anything security- or privacy-affecting privately, to **contact@teslawave.app**,
rather than opening an issue. Say what you found and how to see it again; a proof of concept
against your own drive is welcome. You will get an answer within a few days, and credit in
the fix unless you would rather not be named.

There is no bounty. It is one person's side project on a free plan.

## What matters most here

The app is deliberately small, and so is its attack surface. In rough order of severity:

1. **Somebody else's position.** Positions live in memory in a Durable Object and are never
   written to a database. Anything that lets a client read a position it was not sent, keep
   reading one after a driver goes invisible, or link a public handle to an identity is the
   most serious kind of bug this project can have.
2. **Identity.** A driver is a hashed secret held in their own browser
   ([ADR-0025](../docs/decisions/0025-identity-is-a-hashed-secret.md)). Recovering the secret
   from the public id, or impersonating another driver's waves, belongs here.
3. **The cost invariants.** Anything that makes the hub ineligible for hibernation, or that
   forces unbounded Durable Objects, database writes or requests, is a denial-of-wallet bug
   even though nothing leaks — see [ADR-0002](../docs/decisions/0002-hub-durable-object-and-cost-model.md).
4. **The browser policy.** The headers in `apps/web/public/_headers` are enforced by the
   browser and nothing else. A script-injection path, or a way past that policy, counts.

What does not: the absence of accounts, rate limits you can hit by driving normally, and the
map tiles being served by a third party ([OpenFreeMap](https://openfreemap.org)), all of
which are choices written down in [docs/decisions](../docs/decisions).

## Supported versions

There is one version: what is deployed at [teslawave.app](https://teslawave.app), from `main`.
Clients in the field are replaced through the protocol handshake
([ADR-0029](../docs/decisions/0029-protocol-version-and-remote-reload.md)), so a fix reaches
a car that has been sitting on one tab for weeks the next time it is standing still.

`WS_ENABLED=false` in the Cloudflare dashboard stops the hub accepting sockets without a
deploy, and is the first move if something needs to stop right now.
