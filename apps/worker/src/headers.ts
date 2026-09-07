/**
 * The security headers on the Worker's own responses: the API, and anything that reaches our
 * code at all.
 *
 * The Content-Security-Policy is deliberately *not* here. It governs what the browser will
 * run, so it belongs on the documents and scripts — and those are served by the asset layer
 * without ever reaching this Worker, because `run_worker_first` is scoped to `/ws` and
 * `/api/*` to keep asset requests outside the 100k/day quota (ADR-0002). Cloudflare applies
 * `apps/web/public/_headers` there for free; that file is the one source of truth for the
 * policy, and it carries the reasoning.
 *
 * What is left is the set that is worth having on a JSON response: do not sniff it, do not
 * leak the URL it was requested from, and stay on https.
 */
export function withSecurityHeaders(response: Response, url: URL): Response {
  const out = new Response(response.body, response);
  out.headers.set('x-content-type-options', 'nosniff');
  // The URL a driver is on is a place they are. Nothing of ours leaves in a referer.
  out.headers.set('referrer-policy', 'no-referrer');
  // Ignored by browsers over plain http, so this is safe for the local dev server too.
  if (url.protocol === 'https:')
    out.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return out;
}
