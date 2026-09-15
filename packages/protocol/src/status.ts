/**
 * A word about the drive, chosen from a short list rather than typed: the car's keyboard is
 * hostile (brief 2.2) and five honest options cover what a driver usually wants to say
 * across a lane. The id is the wire format; the words live in each language's catalogue, so
 * a French driver's "En balade" is read as "Just cruising" on an English screen.
 */
export const STATUSES = ['roadtrip', 'charging', 'commute', 'cruising', 'newowner'] as const;
export type StatusId = (typeof STATUSES)[number];

export const isStatusId = (v: unknown): v is StatusId =>
  typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

/**
 * A driver can also write their own, which is the one thing the five cannot do: say
 * something nobody anticipated (ADR-0040, amended). It is the nickname's bargain exactly —
 * typed at a standstill, capped, cleaned, shown as its author wrote it, translated by
 * nobody — and it carries the nickname's risk and no new one.
 *
 * Longer than a nickname because it is a phrase rather than a name, and short enough to read
 * in a glance on a card.
 */
export const STATUS_MAX_LEN = 24;

/**
 * Trimmed, inner whitespace collapsed, capped, then trimmed again: a cut that lands on a
 * space would otherwise leave one hanging on the end of the card. Empty means no status,
 * never an empty chip.
 */
export const cleanStatusText = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const text = v.trim().replace(/\s+/g, ' ').slice(0, STATUS_MAX_LEN).trim();
  return text.length > 0 ? text : undefined;
};
