import { CELL_PRECISION, WIRE_COORD_SCALE } from './constants.js';
import { encode } from './geohash.js';

/**
 * What a driver can flag on the road for the drivers behind them. Two things, both of which
 * everybody recognises from Waze, and neither of which needs a word typed on a car screen.
 * The list is closed on purpose: every kind has a lifetime, a marker, a spoken line in every
 * language, and a legal reading that was thought about (ADR-0040).
 */
export const REPORT_KINDS = ['police', 'accident'] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const isReportKind = (v: unknown): v is ReportKind =>
  typeof v === 'string' && (REPORT_KINDS as readonly string[]).includes(v);

/**
 * How long a report stays on the map after the last driver said it was there.
 *
 * A patrol parked on a bridge is there for the afternoon, and the first cut let it lapse in
 * half an hour — the shortest life of anything on the map, for the thing drivers most want
 * to know about. An accident is the other way round: it is cleared by people whose job that
 * is, usually within the hour (ADR-0040, amended).
 */
export const REPORT_TTL_MS: Record<ReportKind, number> = {
  police: 90 * 60_000,
  accident: 60 * 60_000,
};

export const reportTtlMs = (kind: ReportKind): number => REPORT_TTL_MS[kind];

/**
 * The ceiling, measured from when a report was first placed and not from the last
 * confirmation: however many drivers keep saying a patrol is there, the pin goes after this.
 *
 * Without it "still there" is a pin that never dies — one driver passing their own report
 * every hour keeps it alive for ever, and a map of things that were true this morning is
 * worse than an empty one. Four hours is longer than any of these is plausibly true and
 * short enough that a stale pin is somebody's afternoon rather than their week.
 */
export const REPORT_MAX_LIFE_MS = 4 * 3_600_000;

/**
 * A report, as everyone sees it. Nothing here says who made it or who voted on it: `n` is how
 * many drivers say it is there, `no` how many say it is gone, `at` when the last of the
 * first group said so, `first` when it was placed. The position is where the reporting car
 * was when its driver tapped, which is the thing itself.
 */
export type Report = {
  id: string;
  kind: ReportKind;
  lat: number;
  lng: number;
  /** Server time of the latest confirmation; the lifetime is measured from here. */
  at: number;
  /** Server time of the first report, which the ceiling is measured from. */
  first: number;
  /** Drivers who say it is there, counting the first to say so. */
  n: number;
  /** Drivers who have since said it is gone. At `n` the report is dropped. */
  no: number;
};

/**
 * When a report lapses: the kind's lifetime from the last confirmation, or the ceiling from
 * when it was placed, whichever comes first. Both sides work it out from the same two
 * numbers rather than the hub sending a deadline, so the rule is one rule.
 */
export const reportExpiryAt = (report: Pick<Report, 'kind' | 'at' | 'first'>): number =>
  Math.min(report.at + reportTtlMs(report.kind), report.first + REPORT_MAX_LIFE_MS);

/** The cell a report falls in, which is what decides who is told about it. */
export const reportCell = (report: { lat: number; lng: number }): string =>
  encode(report.lat, report.lng, CELL_PRECISION);

/** The client's own position on the wire, at WIRE_COORD_SCALE, as the hello already sends it. */
export const toWireAt = (pos: { lat: number; lng: number }): readonly [number, number] => [
  Math.round(pos.lat * WIRE_COORD_SCALE),
  Math.round(pos.lng * WIRE_COORD_SCALE),
];
