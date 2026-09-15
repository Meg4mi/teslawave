/**
 * A word about the drive, chosen from a short list rather than typed: the car's keyboard is
 * hostile (brief 2.2), a free field would need moderating, and five honest options cover
 * what a driver actually wants to say across a lane. The id is the wire format; the words
 * live in each language's catalogue.
 */
export const STATUSES = ['roadtrip', 'charging', 'commute', 'cruising', 'newowner'] as const;
export type StatusId = (typeof STATUSES)[number];

export const isStatusId = (v: unknown): v is StatusId =>
  typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
