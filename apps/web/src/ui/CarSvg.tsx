import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { TeslaModel } from '@teslawave/protocol';
import { buildCarScene, showsFineDetail, type Paint } from '../overlay/car-scene';

/**
 * A car as inline SVG: the same drawing as the map sprite, but a vector, so the hero in
 * onboarding is as crisp at 500 px as the chip in a toast is at 28. No filters, no blur —
 * every effect is a gradient or a stroke, and the document is a few kilobytes of paths.
 */
export function CarSvg({
  model,
  colour,
  size = 48,
  heading = 0,
  className,
  style,
}: {
  model: TeslaModel;
  colour: string;
  /** The car's length in CSS pixels, whichever way it is turned. */
  size?: number;
  /** Degrees clockwise from nose-up. 90 lays the car on its side, nose to the right. */
  heading?: number;
  className?: string;
  style?: CSSProperties;
}): ReactNode {
  const id = useId().replace(/:/g, '');
  const scene = useMemo(() => buildCarScene(model, colour), [model, colour]);

  const gradients: ReactNode[] = [];
  const paintRef = (paint: Paint, key: string): string => {
    if (typeof paint === 'string') return paint;
    const gid = `${id}-g${key}`;
    gradients.push(
      <linearGradient
        key={gid}
        id={gid}
        gradientUnits="userSpaceOnUse"
        x1={paint.from[0]}
        y1={paint.from[1]}
        x2={paint.to[0]}
        y2={paint.to[1]}
      >
        {paint.stops.map(([offset, stop]) => (
          <stop key={offset} offset={offset} stopColor={stop} />
        ))}
      </linearGradient>,
    );
    return `url(#${gid})`;
  };

  // A chip in a toast gets clean paint and glass; the hero gets the wipers and the door cuts.
  const fine = showsFineDetail(size);
  const elements = scene.ops.flatMap((op, i) => {
    if (op.fine && !fine) return [];
    const paint = paintRef(op.paint, String(i));
    const common = {
      clipPath: op.clip ? `url(#${id}-c-${op.clip})` : undefined,
      opacity: op.alpha,
    };
    const shape =
      op.kind === 'fill'
        ? { d: op.d, fill: paint, transform: op.offset ? `translate(${op.offset[0]} ${op.offset[1]})` : undefined }
        : {
            d: op.d,
            fill: 'none',
            stroke: paint,
            strokeWidth: op.width,
            strokeLinecap: op.cap ?? 'butt',
            strokeLinejoin: 'round' as const,
          };
    const one = <path key={i} {...common} {...shape} />;
    if (!op.mirror) return [one];
    const mirrored = {
      ...shape,
      transform: `scale(-1 1)${shape.transform ? ` ${shape.transform}` : ''}`,
    };
    return [one, <path key={`${i}m`} {...common} {...mirrored} />];
  });

  // The box fits the car as it is turned: upright, on its side, or — for any other heading —
  // a square that a rotated car can never clip.
  const pad = 140;
  const long = scene.lengthMm + pad * 2;
  const short = scene.halfWidthMm * 2 + pad * 2;
  const turn = ((heading % 180) + 180) % 180;
  const [w, h] = turn === 0 ? [short, long] : turn === 90 ? [long, short] : [long, long];
  const px = size / long;
  return (
    <svg
      className={className}
      viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`}
      width={w * px}
      height={h * px}
      style={style}
      aria-hidden
      focusable="false"
    >
      <defs>
        {Object.entries(scene.clips).map(([name, d]) => (
          <clipPath key={name} id={`${id}-c-${name}`}>
            <path d={d} />
          </clipPath>
        ))}
        {gradients}
      </defs>
      <g transform={heading ? `rotate(${heading})` : undefined}>{elements}</g>
    </svg>
  );
}
