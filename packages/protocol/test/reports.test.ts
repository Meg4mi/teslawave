import { describe, expect, it } from 'vitest';
import {
  REPORT_MAX_LIFE_MS,
  REPORT_TTL_MS,
  reportExpiryAt,
  reportTtlMs,
} from '../src/reports.js';

/**
 * When a pin dies. Two clocks, and the earlier one wins: the kind's lifetime from the last
 * driver who said it was there, and a ceiling from when it was placed, so "still there"
 * cannot keep a patrol on the map for ever (ADR-0040, amended).
 */
describe('a report lapses', () => {
  const START = 1_700_000_000_000;

  it('gives the police longer than an accident, because a patrol outlasts a clear-up', () => {
    expect(reportTtlMs('police')).toBeGreaterThan(reportTtlMs('accident'));
    expect(REPORT_TTL_MS.police).toBe(90 * 60_000);
  });

  it('counts the lifetime from the last confirmation, not from the first report', () => {
    const confirmedLater = reportExpiryAt({ kind: 'accident', first: START, at: START + 30 * 60_000 });
    expect(confirmedLater).toBe(START + 90 * 60_000);
  });

  it('never goes past the ceiling, however often it is confirmed', () => {
    // Confirmed three and a half hours in: the kind's own lifetime would reach five and a
    // half, and the ceiling is what answers.
    const late = reportExpiryAt({ kind: 'police', first: START, at: START + 3.5 * 3_600_000 });
    expect(late).toBe(START + REPORT_MAX_LIFE_MS);
    expect(REPORT_MAX_LIFE_MS).toBe(4 * 3_600_000);
  });
});
