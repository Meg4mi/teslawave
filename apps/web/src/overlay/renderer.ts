import { TRAIL_MS, colourOf } from '@teslawave/protocol';
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

/**
 * One wave, as a choreography on a single clock rather than a ring here and a dot there.
 *
 * `null` for either end means your own car. A wave you send flies from you to them and lands
 * on them; a wave you receive flies from them to you, and its rings leave *their* car and
 * grow until they have washed over the whole screen, so the wave physically arrives at you.
 * Nothing under a second reads on a car screen watched from the corner of an eye, so the
 * whole sequence takes about two and a half, and every part of it is a stroke, an arc or a
 * scale: no gradient, no blur, nothing allocated per frame (ADR-0014, ADR-0022).
 */
export type WaveKind = 'sent' | 'received';

export type WaveBurst = {
  kind: WaveKind;
  fromId: string | null;
  toId: string | null;
  startedAt: number;
};

/** The clock every part of a wave runs on, in milliseconds from the tap or the message. */
export const WAVE_TIMING = {
  /** The comet's flight from one car to the other. */
  flightMs: 600,
  /** When the comet lands: the target pops and its impact ring leaves. */
  impactAt: 520,
  popMs: 520,
  impactRingMs: 700,
  /** The solid line joining the two cars, bright at first, gone by the time the rings are. */
  linkMs: 1_000,
  /** Shockwave rings: this many, this far apart, each living this long. */
  rings: 5,
  ringGapMs: 200,
  ringMs: 1_600,
  /** Everything is over by here. */
  totalMs: 2_600,
} as const;

const WAVE_COLOUR: Record<WaveKind, string> = { sent: '#6ee7ff', received: '#ffd08a' };
/** How far a sent wave's rings travel from the car it lands on. Yours is a nod, not a flood. */
const SENT_RING_REACH_PX = 260;
const COMET_RADIUS = 9;
const COMET_GHOSTS = 6;

export type RenderOptions = {
  cars: RenderCar[];
  self: { lat: number; lng: number; heading: number; model: string; colour: string } | null;
  nearbyId: string | null;
  selectedId: string | null;
  trails: boolean;
  /** Nothing within 10 km: keep the screen alive with a slow ambient sweep. */
  ambient: boolean;
  bearing: number;
  zoom: number;
};

/**
 * A real car is about 3 px at the zoom we follow at, so sprites are deliberately oversized:
 * this is a map of who is around you, not a scale drawing. The size tracks zoom so they stay
 * findable when zoomed out without dominating the road when zoomed in.
 */
const SPRITE_BASE_ZOOM = 15.5;
const SPRITE_BASE_PX = 46;
export const spriteScaleFor = (zoom: number, drawn: number): number => {
  const px = Math.min(58, Math.max(30, SPRITE_BASE_PX + (zoom - SPRITE_BASE_ZOOM) * 4));
  return px / drawn;
};

const TRAIL_WIDTH = 2.5;
const TRAIL_ALPHA = 0.35;
/**
 * A trail fades along its length, and the obvious way to draw that is one stroke per segment
 * with its own alpha: sixty strokes per car, twelve hundred a frame with twenty cars, and a
 * `stroke()` is the one call here that costs real time on an Intel Atom. The fade is
 * quantised instead: the alpha only ever falls from the car backwards, so consecutive segments
 * at the same level form one path, and a whole trail is at most this many strokes.
 */
const TRAIL_LEVELS = 6;
/** A car this far off the screen has no trail worth walking. */
const TRAIL_CULL_PX = 900;
const CONE_LENGTH = 60;
const CONE_SPREAD = 12;

export function createRenderer(canvas: HTMLCanvasElement) {
  const waves: WaveBurst[] = [];
  let sonarStartedAt = 0;

  const positionOf = (id: string, cars: RenderCar[]): { lat: number; lng: number } | null => {
    const car = cars.find((c) => c.id === id);
    return car ? { lat: car.placement.lat, lng: car.placement.lng } : null;
  };

  return {
    addWave(wave: Omit<WaveBurst, 'startedAt'>): void {
      waves.push({ ...wave, startedAt: performance.now() });
      if (waves.length > 8) waves.shift();
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

      const { cars, self, nearbyId, selectedId, bearing, zoom } = options;
      const sizeScale = spriteScaleFor(zoom, SPRITE_LENGTH);

      for (let i = waves.length - 1; i >= 0; i--) {
        const wave = waves[i];
        if (wave && now - wave.startedAt >= WAVE_TIMING.totalMs) waves.splice(i, 1);
      }
      const endOf = (id: string | null): { lat: number; lng: number } | null =>
        id === null ? self : positionOf(id, cars);
      /** The pop a car makes when a wave lands on it: a single half-sine, 30% larger at peak. */
      const popOf = (id: string | null): number => {
        let scale = 1;
        for (const wave of waves) {
          if (wave.toId !== id) continue;
          const t = (now - wave.startedAt - WAVE_TIMING.impactAt) / WAVE_TIMING.popMs;
          if (t > 0 && t < 1) scale = Math.max(scale, 1 + 0.3 * Math.sin(Math.PI * t));
        }
        return scale;
      };

      // 1. Trails, under everything. Traffic reads as light painting from above.
      if (options.trails) {
        ctx.lineWidth = TRAIL_WIDTH;
        for (const car of cars) {
          const trail = car.trail;
          const first = trail[0];
          if (trail.length < 2 || !first) continue;
          const head = project(car.placement.lng, car.placement.lat);
          if (
            head.x < -TRAIL_CULL_PX ||
            head.y < -TRAIL_CULL_PX ||
            head.x > width + TRAIL_CULL_PX ||
            head.y > height + TRAIL_CULL_PX
          )
            continue;
          ctx.strokeStyle = colourOf(car.colour).hex;
          let level = 0;
          let open = false;
          let prev = project(first.lng, first.lat);
          for (let i = 1; i < trail.length; i++) {
            const point = trail[i];
            if (!point) continue;
            const p = project(point.lng, point.lat);
            const next = Math.ceil(TRAIL_LEVELS * Math.max(0, 1 - (now - point.at) / TRAIL_MS));
            if (next > 0) {
              if (next !== level) {
                if (open) ctx.stroke();
                level = next;
                ctx.globalAlpha = (TRAIL_ALPHA * level) / TRAIL_LEVELS;
                ctx.beginPath();
                ctx.moveTo(prev.x, prev.y);
                open = true;
              }
              ctx.lineTo(p.x, p.y);
            }
            prev = p;
          }
          if (open) ctx.stroke();
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

      // 2b. A wave lights the line between the two cars up solid, then lets it go.
      for (const wave of waves) {
        const t = (now - wave.startedAt) / WAVE_TIMING.linkMs;
        if (t >= 1) continue;
        const from = endOf(wave.fromId);
        const to = endOf(wave.toId);
        if (!from || !to) continue;
        const a = project(from.lng, from.lat);
        const b = project(to.lng, to.lat);
        ctx.globalAlpha = 0.85 * (1 - t);
        ctx.strokeStyle = WAVE_COLOUR[wave.kind];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // 3. Your heading cone, so "track up" feels deliberate. Two faint arcs rather than a
      // filled wedge: a solid triangle over a dark map reads as a grey shadow, not as light.
      if (self) {
        const p = project(self.lng, self.lat);
        const angle = ((self.heading - bearing) * Math.PI) / 180 - Math.PI / 2;
        const spread = (CONE_SPREAD * Math.PI) / 180;
        ctx.strokeStyle = '#6ee7ff';
        ctx.lineWidth = 1.2;
        for (const [radius, alpha] of [
          [CONE_LENGTH * 0.55, 0.22],
          [CONE_LENGTH, 0.12],
        ] as const) {
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, angle - spread, angle + spread);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }

      // 4. Cars.
      for (const car of cars) {
        const p = project(car.placement.lng, car.placement.lat);
        if (p.x < -80 || p.y < -80 || p.x > width + 80 || p.y > height + 80) continue;

        const appearing = Math.min(1, Math.max(0, (now - car.appearedAt) / 300));
        const sprite = getSprite(car.model, car.colour, dpr);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(((car.placement.heading - bearing) * Math.PI) / 180);
        let scale = appearing * sizeScale;
        if (car.id === nearbyId) {
          // Breathing, only for the car you can wave at.
          scale *= 1 + 0.06 * Math.sin((now / 1_600) * Math.PI * 2);
        }
        if (car.id === selectedId) scale *= 1.08;
        scale *= popOf(car.id);
        ctx.globalAlpha = appearing;
        ctx.scale(scale, scale);
        ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
        ctx.restore();
        ctx.globalAlpha = 1;

        // The single ring that announces a car arriving.
        if (now - car.appearedAt < 600) {
          // Clamped, because these two clocks are not the same reading. `appearedAt` is a
          // `performance.now()` taken when the message arrived; `now` is the frame's start
          // time, which can be a few milliseconds earlier. A negative radius throws, and the
          // throw took the rest of the frame's drawing with it.
          const t = Math.max(0, (now - car.appearedAt) / 600);
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
        const scale = sizeScale * popOf(null);
        ctx.scale(scale, scale);
        ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
        ctx.restore();
      }

      // 6. Waves: the comet, the impact, and the rings, all on one clock.
      for (const wave of waves) {
        const age = now - wave.startedAt;
        const colour = WAVE_COLOUR[wave.kind];
        const from = endOf(wave.fromId);
        const to = endOf(wave.toId);
        ctx.strokeStyle = colour;
        ctx.fillStyle = colour;

        // The comet: a head and a handful of fading ghosts behind it, thrown from one car to
        // the other. Seven arcs, so it costs what the old five-pixel dot cost.
        if (from && to && age < WAVE_TIMING.flightMs) {
          const a = project(from.lng, from.lat);
          const b = project(to.lng, to.lat);
          for (let k = COMET_GHOSTS; k >= 0; k--) {
            const t = age / WAVE_TIMING.flightMs - k * 0.03;
            if (t <= 0) continue;
            const eased = 1 - (1 - t) * (1 - t);
            ctx.globalAlpha = k === 0 ? 1 : 0.7 * (1 - k / (COMET_GHOSTS + 1));
            ctx.beginPath();
            ctx.arc(
              a.x + (b.x - a.x) * eased,
              a.y + (b.y - a.y) * eased,
              COMET_RADIUS - k,
              0,
              Math.PI * 2,
            );
            ctx.fill();
          }
        }

        // The impact ring: leaves the car the wave lands on as it pops.
        const impactT = (age - WAVE_TIMING.impactAt) / WAVE_TIMING.impactRingMs;
        if (to && impactT > 0 && impactT < 1) {
          const p = project(to.lng, to.lat);
          const eased = 1 - (1 - impactT) * (1 - impactT);
          ctx.globalAlpha = 0.9 * (1 - impactT);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, SPRITE_LENGTH * (0.5 + eased * 1.3), 0, Math.PI * 2);
          ctx.stroke();
        }

        // The shockwave. Yours leaves the car you waved at and travels a little way; one you
        // receive leaves the sender the moment it arrives and grows until it has crossed the
        // whole screen, whichever corner they are in. Large arcs are still one stroke each:
        // the boot sonar has always drawn one this size.
        const received = wave.kind === 'received';
        const anchor = received ? from : to;
        const ringsStartAt = received ? 0 : WAVE_TIMING.impactAt;
        if (anchor) {
          const p = project(anchor.lng, anchor.lat);
          const reach = received
            ? Math.hypot(Math.max(p.x, width - p.x), Math.max(p.y, height - p.y)) * 1.05
            : SENT_RING_REACH_PX;
          const rings = received ? WAVE_TIMING.rings : 3;
          ctx.lineWidth = received ? 5 : 3;
          for (let ring = 0; ring < rings; ring++) {
            const rt = (age - ringsStartAt - ring * WAVE_TIMING.ringGapMs) / WAVE_TIMING.ringMs;
            if (rt <= 0 || rt >= 1) continue;
            // A gentle ease and a fade that holds, then drops: with a sharper ease and a
            // linear fade each ring had left the screen, faint, by half its life, and the
            // whole shockwave was over in a second.
            const eased = 1 - (1 - rt) * (1 - rt * 0.5);
            ctx.globalAlpha = 0.85 * (1 - rt * rt);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 20 + eased * (reach - 20), 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }

      // 7. The boot sonar sweep, and the ambient one when the road is quiet.
      const sonarT = Math.max(0, (now - sonarStartedAt) / 900);
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
