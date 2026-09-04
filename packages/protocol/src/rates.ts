import {
  POS_HEADING_DELTA_DEG,
  POS_INTERVAL_MOVING_MS,
  POS_INTERVAL_STATIONARY_MS,
  POS_SPEED_DELTA_KMH,
  RATE_POS_MS,
  STATIONARY_SPEED_KMH,
} from './constants.js';

export type SentPos = { heading: number; speed: number; sentAt: number };

const headingDelta = (a: number, b: number): number => {
  const d = Math.abs(((((b - a) % 360) + 540) % 360) - 180);
  return d;
};

/**
 * How often the client sends its position. This is the single biggest lever on the
 * request budget: every inbound message is billed (20:1) before our code runs (ADR-0002).
 */
export function shouldSendPos(
  prev: SentPos | null,
  next: { heading: number; speed: number },
  now: number,
): boolean {
  if (!prev) return true;
  const since = now - prev.sentAt;
  if (since < RATE_POS_MS) return false;
  if (headingDelta(prev.heading, next.heading) > POS_HEADING_DELTA_DEG) return true;
  if (Math.abs(next.speed - prev.speed) > POS_SPEED_DELTA_KMH) return true;
  const moving = next.speed >= STATIONARY_SPEED_KMH;
  return since >= (moving ? POS_INTERVAL_MOVING_MS : POS_INTERVAL_STATIONARY_MS);
}
