import { useEffect, useState } from 'react';

export type Pulse = { online: number; wavesToday: number };

/**
 * How many drivers are out there, asked before joining (ADR-0032).
 *
 * The first screen is a configurator over a map with nothing on it, and a driver deciding
 * whether to tap Go has no way to know whether anyone is out there. The app has the number —
 * it shows it in the HUD the moment you connect — one step too late to inform the decision.
 *
 * Deliberately quiet about failure. This feeds one optional line of copy: if the request
 * fails, or the answer is nobody, the screen says nothing rather than saying zero. "0 drivers
 * online" on a landing page is worse than no line at all.
 */
export function usePulse(at: { lat: number; lng: number } | null): Pulse | null {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const lat = at?.lat;
  const lng = at?.lng;

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    let cancelled = false;
    void fetch(`/api/pulse?lat=${lat.toFixed(3)}&lng=${lng.toFixed(3)}`)
      .then((res) => (res.ok ? (res.json() as Promise<Pulse>) : null))
      .then((body) => {
        if (cancelled || !body || typeof body.online !== 'number') return;
        setPulse({ online: body.online, wavesToday: body.wavesToday ?? 0 });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Three decimals is about 100 m: far finer than the 39 km cell the answer is keyed on,
    // and enough to stop a moving fix from re-asking on every metre.
  }, [lat, lng]);

  return pulse;
}
