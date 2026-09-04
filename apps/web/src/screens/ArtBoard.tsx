import type { ReactNode } from 'react';
import { CAR_COLOURS, TESLA_MODELS } from '@teslawave/protocol';
import { CarSvg } from '../ui/CarSvg';
import { CarChip } from '../ui/CarChip';

/**
 * Development only: every model, large, in one colour, next to the map-sized sprite. The
 * only way to judge whether a drawing reads as the car it claims to be.
 */
export function ArtBoard(): ReactNode {
  const params = new URLSearchParams(location.search);
  const colour = params.get('colour') ?? 'pearl';
  const size = Number(params.get('size') ?? 560);
  const bg = params.get('bg') ?? '#0e1319';
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: bg, padding: 24 }}>
      <div data-artboard style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {TESLA_MODELS.map((model) => (
          <div key={model} style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
            <CarSvg model={model} colour={colour} size={size} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <CarChip model={model} colour={colour} size={46} />
              <CarChip model={model} colour={colour} size={28} />
            </div>
          </div>
        ))}
      </div>
      <div data-artboard-side style={{ display: 'grid', gap: 16, marginTop: 24 }}>
        {CAR_COLOURS.map((c) => (
          <div key={c.id} style={{ display: 'flex', gap: 16 }}>
            {TESLA_MODELS.map((model) => (
              <CarSvg key={model} model={model} colour={c.id} size={Number(params.get('row') ?? 220)} heading={90} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
