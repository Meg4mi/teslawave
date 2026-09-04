# 0011. Zustand for identity, module state for the world, code-based routes

Status: accepted
Date: 2026-09-04

## Context

Two kinds of state with nothing in common. Identity and preferences change a few times a
session and must persist. The world changes sixty times a second and must never cause a
React render.

## Decision

- **Identity and preferences**: a small Zustand store with hand-written `localStorage`
  reads and writes, validated on read because stored data is as untrusted as anything else.
- **The world**: mutable module state in `sim/world.ts`. The canvas reads it directly in the
  animation loop. React subscribes through `useSyncExternalStore` to a *summary* (counters,
  the nearby car) recomputed at most twice a second.
- **Routing**: TanStack Router with code-based routes, three of them.

## Rejected alternatives

- **Putting cars in React state**: sixty renders a second of a tree that does not change
  visibly, on an Intel Atom.
- **A reducer or an external state library for the world**: the world is one map and a few
  numbers; a library would add bundle weight and a subscription per car.
- **File-based routes**: a code generator and a plugin for three routes.

## Consequences

The split is a rule, not a habit: anything that changes per frame lives in the module and is
read by the renderer; anything a person can see as text lives in the summary. `resetWorld`
clears the summary too, because a stale one would show counts for a session that no longer
exists.
