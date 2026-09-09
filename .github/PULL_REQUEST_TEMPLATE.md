## What this changes

<!-- One or two sentences. What a driver, or the next person reading the code, notices. -->

## How it was proved

<!-- Which test, which screen, which run. "Tried it locally" is a fine answer; say on what. -->

- [ ] `pnpm lint` `pnpm typecheck` `pnpm test` `pnpm build` pass
- [ ] `pnpm check:css` and `pnpm check:size` pass, if this touched the UI
- [ ] `pnpm test:e2e` run, if this touched the rendering path
- [ ] the roundtrip rig covers it, if this touched the protocol (`apps/web/src/sim/roundtrip.test.ts`)
- [ ] `PROTOCOL_VERSION` bumped, if an old client and a new hub would now disagree
- [ ] the five cost invariants still hold (no timers or alarms in the hub, `ctx.acceptWebSocket()`,
      no `fetch` or D1 from a message handler, no positions persisted, hub id validated at the edge)
- [ ] an ADR added in `docs/decisions/`, if this turned on a judgement call
- [ ] copy landed in every language in `apps/web/src/i18n/`, if it added user-visible words

<!-- Small, obvious fixes need no ceremony: delete what does not apply and open it. -->
