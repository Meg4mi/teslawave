# 0030. The security policy is served by the asset layer, not by the Worker

Status: accepted
Date: 2026-09-07

## Context

A driver's whole identity is one secret in `localStorage` (ADR-0025). There is no account, no
password and no session cookie, which is the privacy design working — but it means the secret
*is* the driver. Anything that can run script on our origin can read it, derive the same id,
and be that person until they clear site data. There is nothing else to steal and nothing
else to protect.

Nothing stopped that. The app shipped with no Content-Security-Policy, no HSTS, no
`nosniff` and no `frame-ancestors`. The injection surface is small — no user-generated HTML,
one nickname rendered as text, no `dangerouslySetInnerHTML` — but "small" is a property of
today's code, and a policy is the control that survives tomorrow's.

The obvious place to set headers is the Worker. That place is wrong here, and the reason is
the cost model. `run_worker_first` is scoped to `/ws` and `/api/*` precisely so that the HTML,
the bundle and the icons are served by Cloudflare's asset layer, where requests are free and
outside the 100k/day quota (ADR-0002). A request for `/` therefore never reaches our code.
Setting the policy from the Worker would mean widening `run_worker_first` to cover assets,
putting every page load and every script into the request budget: thousands a day, spent on a
header, against a budget the whole traffic model is built around.

## Decision

**The policy lives in `apps/web/public/_headers`**, which Cloudflare applies at the asset
layer for nothing. It is the one source of truth, and it carries its own reasoning inline.

The Worker keeps only what applies to its own responses — `nosniff`, `Referrer-Policy`, and
HSTS over https — in `apps/worker/src/headers.ts`, applied on one path so a new endpoint
cannot forget them. A CSP on a JSON response governs nothing.

The policy itself, and why each part is what it is:

- `script-src 'self'` plus the analytics host, with **no** `'unsafe-inline'` and no
  `'unsafe-eval'`. This is the directive that does the work. The app has no inline script to
  accommodate: Vite emits modules and the analytics tag is an external file with a data
  attribute. Keeping it that way is the constraint worth defending.
- `style-src` needs `'unsafe-inline'`. MapLibre writes inline styles onto the elements it
  positions and React writes them from the `style` prop; neither can be nonced, and a style
  injection cannot read `localStorage`.
- `connect-src 'self'` covers the WebSocket. CSP matches `wss://` against an `https://` origin
  of the same host, and this is asserted against a real browser rather than assumed.
- `worker-src 'self' blob:`. MapLibre's tile worker is same-origin, but MapLibre falls back to
  a blob worker when a module worker will not construct, and that fallback being blocked looks
  exactly like a map that renders nothing.
- `frame-ancestors 'none'`. Clickjacking the "Go" button is a way to make someone broadcast
  their position without meaning to.

**And it is tested where it applies.** `apps/web/e2e/csp.spec.ts` drives the real app behind
the real header and fails on the browser's own `securitypolicyviolation` events, on console
refusals, and on the socket not opening. The e2e workflow now triggers on `_headers` and on
`apps/worker/src/**`.

## Rejected alternatives

- **Set the headers in the Worker.** Costs the free asset tier, which is load-bearing for the
  whole cost model. Rejected on price, not on taste.
- **Generate `_headers` at build time from a shared constant.** Two representations of one
  policy, a plugin to keep them in step, and a codegen step to debug when it drifts. The file
  Cloudflare reads is the honest place to write it.
- **Name the socket origin explicitly (`wss://teslawave.app`).** More precise, and wrong for
  every other host the app is served from — `teslawave.meg4mi.workers.dev` today, the local
  dev server during e2e. A static file cannot know the host; `'self'` can.
- **Ship it and check the policy by hand.** A directive that forgets an origin does not throw
  and does not fail a build. It produces a map with no cars on it, and the first report comes
  from a driver, weeks later, as "the app is broken sometimes".

## Consequences

- Assets stay free. Nothing about the request budget changes.
- The policy is enforced by the browser and by nothing else, so the e2e spec is the only proof
  that it is right. Changing `_headers` without running it is changing it blind.
- Adding an origin — a new tile host, an error reporter, a font — means editing `_headers` and
  running `pnpm test:e2e`. That is the intended friction.
- `'unsafe-inline'` in `style-src` is the one real gap. Closing it means teaching MapLibre and
  React to use nonces, which neither supports, and it buys little: the attack this is against
  is script reading a secret, not CSS.
- Creating a pairing code is now rate-limited per address, like claiming one already was. That
  is not a header, but it is the same omission: the cheap half of the pair was the unguarded
  one, and it wrote a D1 row against a budget shared with the daily counter harvest.
