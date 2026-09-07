import { PROTOCOL_VERSION, STATIONARY_SPEED_KMH } from '@teslawave/protocol';

/**
 * What to do when the hub says this build is out of date (ADR-0029).
 *
 * A car is pinned to a tab for weeks, so the app has to be able to replace itself. It also
 * has to never do that while the car is moving: a reload takes the map away for a second or
 * two, and a driver watching a blank screen at 120 km/h is a worse outcome than a driver on
 * a build one version behind. So the reload waits for a standstill, which every drive
 * reaches within minutes.
 *
 * The whole decision is a pure function so the awkward cases — the reload that did not take,
 * the corrupt frame, the car that never stops — are tests rather than hopes.
 */

/** The version we already reloaded for, kept per tab so a stale edge cannot loop us. */
const MARK_KEY = 'tw.upgraded.v';

export type UpgradeState = {
  /** The version the hub says it speaks, once it has said so. */
  wanted: number | null;
  /** The version this tab has already reloaded for, from the session mark. */
  reloadedFor: number | null;
};

export function shouldReload(state: UpgradeState, speedKmh: number): boolean {
  const { wanted, reloadedFor } = state;
  if (wanted === null) return false;
  // Only ever forwards. A frame claiming an older version, or our own, is not a reason to
  // throw the session away — and a client that reloads on any `upgrade` it is handed is one
  // a corrupt or hostile frame can put in a reload loop.
  if (wanted <= PROTOCOL_VERSION) return false;
  // We already tried. The new build did not arrive: an edge still serving the old bundle, a
  // browser cache that outlived the deploy. Reloading again would loop for the whole drive.
  if (reloadedFor === wanted) return false;
  return speedKmh < STATIONARY_SPEED_KMH;
}

export function readMark(): number | null {
  try {
    const raw = sessionStorage.getItem(MARK_KEY);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // Private mode: the mark is a loop guard, and without it the version check below still
    // stops at one reload per version per page load.
    return null;
  }
}

export function writeMark(version: number): void {
  try {
    sessionStorage.setItem(MARK_KEY, String(version));
  } catch {
    // As above.
  }
}
