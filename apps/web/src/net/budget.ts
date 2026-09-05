/**
 * The free tier resets at midnight UTC (ADR-0002). The banner says when that is where the
 * driver is, and it is not always the same hour: Geneva is 02:00 in summer and 01:00 in
 * winter, and a phone on the other side of the world is somewhere else again.
 */
export function nextResetLabel(now = Date.now(), timeZone?: string): string {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(timeZone === undefined ? {} : { timeZone }),
  }).format(next);
}
