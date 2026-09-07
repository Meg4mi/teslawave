import { useEffect, useRef, type ReactNode } from 'react';
import { BRAND } from '@teslawave/protocol';
import { CARD_H, CARD_W, drawShareCard } from '../share/card';

/**
 * The social image, drawn on demand. Development only, like `/art` and `/kitchen-sink`.
 *
 * It is the share card with the product's own words on it, so the picture a link unfurls
 * into is the picture a driver sends from the app: the same car, drawn by the same code
 * (ADR-0020). `scripts/gen-social.mjs` opens this route and saves the canvas as `og.png`;
 * open it by hand to judge a change before regenerating.
 *
 * `?font=` names a face to draw the text in. The generator passes one it has loaded itself,
 * because a build machine's system font is not the car's.
 */
export function OgBoard(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const font = new URLSearchParams(location.search).get('font');
    const draw = (): void => {
      drawShareCard(canvas, {
        model: 'Y',
        colour: 'deepblue',
        headline: BRAND.tagline,
        // One line under it, in the voice of the first screen. English only: the image is
        // one file for every language, and the words that matter are the three above.
        sub: 'A live map of the Teslas around you, on your car screen. Free, no account.',
        brand: BRAND.name,
        domain: BRAND.domain,
        disclaimer: BRAND.disclaimer,
        ...(font ? { font: `"${font}", ui-sans-serif, system-ui, sans-serif` } : {}),
      });
      canvas.dataset['drawn'] = String((Number(canvas.dataset['drawn']) || 0) + 1);
    };
    draw();
    // Drawn again once a late font lands: canvas text does not reflow by itself.
    document.fonts.addEventListener('loadingdone', draw);
    return () => document.fonts.removeEventListener('loadingdone', draw);
  }, []);

  return (
    <div style={{ padding: 24, background: '#26292f', minHeight: '100dvh' }}>
      <canvas
        ref={ref}
        data-og
        style={{ display: 'block', width: CARD_W, height: CARD_H, background: '#08090b' }}
      />
    </div>
  );
}
