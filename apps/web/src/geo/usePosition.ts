import { useEffect, useRef, useState } from 'react';
import { bearingDeg, haversineM } from '@teslawave/protocol';

export type Fix = { lat: number; lng: number; heading: number; speed: number; at: number };
export type GeoStatus = 'idle' | 'granted' | 'denied' | 'unavailable';

/**
 * `?sim=lat,lng,heading,speed,turn` drives a fake car; `turn` is degrees per second, so a
 * curve can be driven on demand. Turning is the case that showed the camera stepping once a
 * second rather than gliding, and without it there was no way to test for that.
 */
type Sim = Fix & { turn: number };

function readSim(): Sim | null {
  const raw = new URLSearchParams(location.search).get('sim');
  if (!raw) return null;
  const [lat, lng, heading = '90', speed = '50', turn = '0'] = raw.split(',');
  if (lat === undefined || lng === undefined) return null;
  const parsed = {
    lat: Number(lat),
    lng: Number(lng),
    heading: Number(heading),
    speed: Number(speed),
    turn: Number(turn),
  };
  if (!Number.isFinite(parsed.lat) || !Number.isFinite(parsed.lng)) return null;
  return { ...parsed, turn: Number.isFinite(parsed.turn) ? parsed.turn : 0, at: Date.now() };
}

const MIN_HEADING_SPEED_KMH = 3;

/**
 * One position source for the whole app. Below walking pace the device heading is noise,
 * so we hold the last one: a car sitting at a light should not spin on the map.
 */
export function usePosition(enabled: boolean): { status: GeoStatus; fix: Fix | null } {
  const [status, setStatus] = useState<GeoStatus>('idle');
  const [fix, setFix] = useState<Fix | null>(null);
  const previous = useRef<Fix | null>(null);
  const heading = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const sim = readSim();
    if (sim) {
      const startedAt = Date.now();
      let frame = 0;
      // Integrated in short steps so a turning car follows an arc rather than a chord.
      let lat = sim.lat;
      let lng = sim.lng;
      let heading = sim.heading;
      let at = startedAt;
      const R = 6_371_000;
      const tick = (): void => {
        const now = Date.now();
        for (let t = at; t < now; t += 100) {
          const step = Math.min(100, now - t) / 1000;
          heading = (((heading + sim.turn * step) % 360) + 360) % 360;
          const metres = (sim.speed / 3.6) * step;
          lat += ((metres * Math.cos((heading * Math.PI) / 180)) / R) * (180 / Math.PI);
          lng +=
            ((metres * Math.sin((heading * Math.PI) / 180)) / (R * Math.cos((lat * Math.PI) / 180))) *
            (180 / Math.PI);
        }
        at = now;
        setStatus('granted');
        setFix({ lat, lng, heading, speed: sim.speed, at: now });
        // One a second, like a real device: the point is that the app copes with that.
        frame = window.setTimeout(tick, 1_000);
      };
      tick();
      return () => clearTimeout(frame);
    }

    if (!('geolocation' in navigator)) {
      const timer = setTimeout(() => setStatus('unavailable'), 0);
      return () => clearTimeout(timer);
    }

    const watch = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, speed, heading: deviceHeading } = position.coords;
        const kmh = typeof speed === 'number' && speed >= 0 ? speed * 3.6 : 0;
        const last = previous.current;
        if (typeof deviceHeading === 'number' && !Number.isNaN(deviceHeading) && kmh >= MIN_HEADING_SPEED_KMH) {
          heading.current = deviceHeading;
        } else if (last && haversineM(last.lat, last.lng, latitude, longitude) > 8) {
          heading.current = bearingDeg(last.lat, last.lng, latitude, longitude);
        }
        const next: Fix = {
          lat: latitude,
          lng: longitude,
          heading: ((heading.current % 360) + 360) % 360,
          speed: kmh,
          at: Date.now(),
        };
        previous.current = next;
        setStatus('granted');
        setFix(next);
      },
      (error) => {
        setStatus(error.code === error.PERMISSION_DENIED ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: true, maximumAge: 1_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, [enabled]);

  return { status, fix };
}
