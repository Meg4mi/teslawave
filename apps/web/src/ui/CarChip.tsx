import { useEffect, useRef, type ReactNode } from 'react';
import type { TeslaModel } from '@teslawave/protocol';
import { getSprite } from '../overlay/sprites';

/**
 * The real sprite, in the real colour, wherever a car is mentioned: in the picker, on the
 * card, inside the toast. Recolouring live as you choose is the small thing that makes
 * onboarding feel built for you.
 */
export function CarChip({
  model,
  colour,
  size = 48,
  heading = 0,
}: {
  model: TeslaModel;
  colour: string;
  size?: number;
  heading?: number;
}): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const sprite = getSprite(model, colour, dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.rotate((heading * Math.PI) / 180);
    const scale = size / sprite.size;
    ctx.scale(scale, scale);
    ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
  }, [model, colour, size, heading]);

  return (
    <canvas
      className="sprite-chip"
      ref={ref}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
