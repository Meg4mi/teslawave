import { colourOf } from '@teslawave/protocol';
import type { RenderCar } from '../sim/world';
import { getSprite, SPRITE_LENGTH } from './sprites';

/**
 * Everything on top of the map is drawn here, on one 2D canvas.
 *
 * Constraints that are not negotiable on MCU 2: no shadowBlur, no filter, no gradients
 * created per frame, no per-car DOM. Gradients and glows are baked into sprites; rings and
 * trails are plain strokes with globalAlpha.
 */
export type Project = (lng: number, lat: number) => { x: number; y: number };

export type Ripple = {
  lng: number;
  lat: number;
  startedAt: number;
  ms: number;
  colour: string;
  rings: number;
  /** Follows a car instead of staying put on the map. */
  followId?: string;
};

export type Flight = { fromId: string | null; toId: string; startedAt: number; ms: number };

export type RenderOptions = {
  cars: RenderCar[];
  self: { lat: number; lng: number; heading: number; model: string; colour: string } | null;
  nearbyId: string | null;
  selectedId: string | null;
  trails: boolean;
  /** Nothing within 10 km: keep the screen alive with a slow ambient sweep. */
  ambient: boolean;
  bearing: number;
};

const TRAIL_WIDTH = 2.5;
const CONE_LENGTH = 60;
const CONE_SPREAD = 12;

export function createRenderer(canvas: HTMLCanvasElement) {
  const ripples: Ripple[] = [];
  const flights: Flight[] = [];
  let sonarStartedAt = 0;

  const positionOf = (id: string, cars: RenderCar[]): { lat: number; lng: number } | null => {
    const car = cars.find((c) => c.id === id);
    return car ? { lat: car.placement.lat, lng: car.placement.lng } : null;
  };

  return {
    addRipple(ripple: Omit<Ripple, 'startedAt'>): void {
      ripples.push({ ...ripple, startedAt: performance.now() });
      if (ripples.length > 24) ripples.shift();
    },

    addFlight(flight: Omit<Flight, 'startedAt'>): void {
      flights.push({ ...flight, startedAt: performance.now() });
      if (flights.length > 8) flights.shift();
    },

    playSonar(): void {
      sonarStartedAt = performance.now();
    },

    render(now: number, project: Project, options: RenderOptions, dpr: number): void {
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;
      const width = canvas.width / dpr;
      const height = canvas.height / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const { cars, self, nearbyId, selectedId, bearing } = options;

      // 1. Trails, under everything. Traffic reads as light painting from above.
      if (options.trails) {
        ctx.lineWidth = TRAIL_WIDTH;
        for (const car of cars) {
          if (car.trail.length < 2) continue;
          const hex = colourOf(car.colour).hex;
          for (let i = 1; i < car.trail.length; i++) {
            const a = car.trail[i - 1];
            const b = car.trail[i];
            if (!a || !b) continue;
            const age = (now - b.at) / 30_000;
            const alpha = Math.max(0, 0.35 * (1 - age));
            if (alpha <= 0.01) continue;
            const p1 = project(a.lng, a.lat);
            const p2 = project(b.lng, b.lat);
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = hex;
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      // 2. The line between you and the car you can wave at.
      if (self && nearbyId) {
        const target = positionOf(nearbyId, cars);
        if (target) {
          const a = project(self.lng, self.lat);
          const b = project(target.lng, target.lat);
          ctx.save();
          ctx.setLineDash([6, 8]);
          ctx.lineDashOffset = -((now / 28) % 14);
          ctx.strokeStyle = 'rgba(110, 231, 255, 0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // 3. Your heading cone, so "track up" feels deliberate.
      if (self) {
        const p = project(self.lng, self.lat);
        const angle = ((self.heading - bearing) * Math.PI) / 180 - Math.PI / 2;
        const spread = (CONE_SPREAD * Math.PI) / 180;
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = '#6ee7ff';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, CONE_LENGTH, angle - spread, angle + spread);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 4. Cars.
      for (const car of cars) {
        const p = project(car.placement.lng, car.placement.lat);
        if (p.x < -80 || p.y < -80 || p.x > width + 80 || p.y > height + 80) continue;

        const appearing = Math.min(1, (now - car.appearedAt) / 300);
        const sprite = getSprite(car.model, car.colour, dpr);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(((car.placement.heading - bearing) * Math.PI) / 180);
        let scale = appearing;
        if (car.id === nearbyId) {
          // Breathing, only for the car you can wave at.
          scale *= 1 + 0.06 * Math.sin((now / 1_600) * Math.PI * 2);
        }
        if (car.id === selectedId) scale *= 1.08;
        ctx.globalAlpha = appearing;
        ctx.scale(scale, scale);
        ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
        ctx.restore();
        ctx.globalAlpha = 1;

        // The single ring that announces a car arriving.
        if (now - car.appearedAt < 600) {
          const t = (now - car.appearedAt) / 600;
          ctx.globalAlpha = 0.5 * (1 - t);
          ctx.strokeStyle = '#6ee7ff';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, SPRITE_LENGTH * (0.5 + t * 1.7), 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }

      // 5. Your own car, drawn last so it is never hidden under someone else.
      if (self) {
        const p = project(self.lng, self.lat);
        const sprite = getSprite(
          self.model as Parameters<typeof getSprite>[0],
          self.colour,
          dpr,
          'self',
        );
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(((self.heading - bearing) * Math.PI) / 180);
        ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
        ctx.restore();
      }

      // 6. Waves in flight: a dot thrown from one car to the other.
      for (let i = flights.length - 1; i >= 0; i--) {
        const flight = flights[i];
        if (!flight) continue;
        const t = (now - flight.startedAt) / flight.ms;
        if (t >= 1) {
          flights.splice(i, 1);
          continue;
        }
        const from = flight.fromId ? positionOf(flight.fromId, cars) : self;
        const to = positionOf(flight.toId, cars) ?? (flight.toId === 'self' ? self : null);
        if (!from || !to) continue;
        const a = project(from.lng, from.lat);
        const b = project(to.lng, to.lat);
        const eased = 1 - (1 - t) * (1 - t);
        ctx.globalAlpha = 1 - t * 0.3;
        ctx.fillStyle = '#6ee7ff';
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * eased, a.y + (b.y - a.y) * eased, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 7. Ripples: three rings leaving a car.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const ripple = ripples[i];
        if (!ripple) continue;
        const t = (now - ripple.startedAt) / ripple.ms;
        if (t >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const anchor = ripple.followId ? positionOf(ripple.followId, cars) : ripple;
        if (!anchor) continue;
        const p = project(anchor.lng, anchor.lat);
        ctx.strokeStyle = ripple.colour;
        ctx.lineWidth = 2;
        for (let ring = 0; ring < ripple.rings; ring++) {
          const offset = ring / ripple.rings / 2;
          const rt = t - offset;
          if (rt <= 0 || rt >= 1) continue;
          ctx.globalAlpha = 0.6 * (1 - rt);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 14 + rt * 70, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // 8. The boot sonar sweep, and the ambient one when the road is quiet.
      const sonarT = (now - sonarStartedAt) / 900;
      if (sonarStartedAt > 0 && sonarT < 1) {
        ctx.globalAlpha = 0.4 * (1 - sonarT);
        ctx.strokeStyle = '#6ee7ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, sonarT * Math.max(width, height) * 0.7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (options.ambient && self) {
        const p = project(self.lng, self.lat);
        const t = (now % 8_000) / 8_000;
        ctx.globalAlpha = 0.05 * (1 - t);
        ctx.strokeStyle = '#6ee7ff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 40 + t * 260, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    },
  };
}

export type Renderer = ReturnType<typeof createRenderer>;
