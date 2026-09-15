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
 * How long a report stays on the map after the last driver confirmed it. A patrol moves on;
 * an accident takes longer to clear. Memory only, on both sides.
 */
export const REPORT_TTL_MS: Record<ReportKind, number> = {
  police: 30 * 60_000,
  accident: 60 * 60_000,
};

export const reportTtlMs = (kind: ReportKind): number => REPORT_TTL_MS[kind];

/**
 * A report, as everyone sees it. Nothing here says who made it: `n` is how many drivers have
 * reported the same thing, `at` is when the last of them did. The position is where the
 * reporting car was when its driver tapped, which is the thing itself.
 */
export type Report = {
  id: string;
  kind: ReportKind;
  lat: number;
  lng: number;
  /** Server time of the latest confirmation; the lifetime is measured from here. */
  at: number;
  /** Drivers who have reported this, counting the first. */
  n: number;
};

/** The cell a report falls in, which is what decides who is told about it. */
export const reportCell = (report: { lat: number; lng: number }): string =>
  encode(report.lat, report.lng, CELL_PRECISION);

/** The client's own position on the wire, at WIRE_COORD_SCALE, as the hello already sends it. */
export const toWireAt = (pos: { lat: number; lng: number }): readonly [number, number] => [
  Math.round(pos.lat * WIRE_COORD_SCALE),
  Math.round(pos.lng * WIRE_COORD_SCALE),
];
