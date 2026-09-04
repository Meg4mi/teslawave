import { useEffect, useRef, type ReactNode } from 'react';
import { Button, Sheet } from '../ui/primitives';
import { COPY } from '../ui/copy';
import { getSprite } from '../overlay/sprites';
import { play, unlockAudio } from '../ui/sound';
import './how-to-wave.css';

const CYCLE_MS = 6_400;

/**
 * The whole product is one gesture, and until now you could only discover it by happening to
 * drive past another user. On a quiet road that is never. So here it is, played out: two cars
 * closing, the button appearing, the wave landing. It loops, and the Wave button in it is
 * real enough to press.
 */
export function HowToWave({ onClose }: { onClose: () => void }): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wavedAt = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const started = performance.now();

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dpr = window.devicePixelRatio;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const t = ((now - started) % CYCLE_MS) / CYCLE_MS;
      // A fixed-width road down the middle: stretched across a 17" screen it stops reading
      // as a road at all.
      const road = Math.min(190, width * 0.5);
      const centre = width / 2;
      const mine = { x: centre - road * 0.26, y: height * 0.68 };
      const approach = Math.min(1, t / 0.34);
      const theirs = { x: centre + road * 0.26, y: height * (-0.12 + approach * 0.66) };
      const close = t >= 0.34;

      ctx.fillStyle = 'rgba(58, 69, 87, 0.35)';
      ctx.fillRect(centre - road / 2, 0, road, height);
      ctx.strokeStyle = 'rgba(122, 140, 168, 0.5)';
      ctx.lineWidth = 1.5;
      for (const x of [centre - road / 2, centre + road / 2]) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      // Scrolling dashes: the cheapest possible way to say "these cars are moving".
      ctx.strokeStyle = 'rgba(160, 178, 202, 0.45)';
      ctx.setLineDash([12, 16]);
      ctx.lineDashOffset = -((now / 12) % 28);
      ctx.beginPath();
      ctx.moveTo(centre, 0);
      ctx.lineTo(centre, height);
      ctx.stroke();
      ctx.setLineDash([]);

      const draw = (
        model: Parameters<typeof getSprite>[0],
        colour: string,
        at: { x: number; y: number },
        rotation: number,
        self: boolean,
      ): void => {
        const sprite = getSprite(model, colour, dpr, self ? 'self' : 'other');
        const pulse = close ? 1 + 0.05 * Math.sin((now / 700) * Math.PI) : 1;
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.rotate(rotation);
        ctx.scale(0.78 * pulse, 0.78 * pulse);
        ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
        ctx.restore();
      };

      draw('Y', 'deepblue', theirs, Math.PI, false);
      draw('3', 'pearl', mine, 0, true);

      // The link between the two cars, exactly as it looks on the map.
      if (close) {
        ctx.strokeStyle = 'rgba(110, 231, 255, 0.5)';
        ctx.setLineDash([5, 7]);
        ctx.lineDashOffset = -((now / 26) % 12);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(mine.x, mine.y);
        ctx.lineTo(theirs.x, theirs.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // The wave itself: automatically once per loop, or whenever the button is pressed.
      const autoWave = t > 0.62 && t < 0.92 ? (t - 0.62) / 0.3 : null;
      const manual = wavedAt.current > 0 ? (now - wavedAt.current) / 900 : null;
      const progress = manual !== null && manual < 1 ? manual : autoWave;
      if (progress !== null && progress > 0 && progress < 1) {
        ctx.strokeStyle = 'rgba(255, 208, 138, 0.9)';
        ctx.lineWidth = 2;
        for (let ring = 0; ring < 3; ring++) {
          const rt = progress - ring * 0.14;
          if (rt <= 0 || rt >= 1) continue;
          ctx.globalAlpha = 0.7 * (1 - rt);
          ctx.beginPath();
          ctx.arc(theirs.x, theirs.y, 12 + rt * 46, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tryIt = (): void => {
    unlockAudio();
    play('sent');
    wavedAt.current = performance.now();
  };

  return (
    <Sheet label={COPY.howTo.title} onClose={onClose}>
      <h2 className="card-sheet__title">{COPY.howTo.title}</h2>
      <p className="hud__note">{COPY.howTo.lead}</p>

      <canvas className="howto__stage" ref={canvasRef} aria-hidden />

      <ol className="howto__steps">
        {COPY.howTo.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="hud__note">{COPY.howTo.tapHint}</p>

      <div className="card-sheet__actions">
        <Button variant="primary" onClick={tryIt}>
          {COPY.howTo.tryIt}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {COPY.howTo.close}
        </Button>
      </div>
    </Sheet>
  );
}
