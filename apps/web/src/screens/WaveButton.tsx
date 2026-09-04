import { useEffect, useState, type ReactNode } from 'react';
import { WAVE_PROMPT_TTL_MS, type TeslaModel } from '@teslawave/protocol';
import { COPY } from '../ui/copy';

/**
 * Appears when another car comes within 150 m and stays for ten seconds, or until they are
 * out of range. The countdown is a hairline running out along the bottom edge.
 */
export function WaveButton({
  target,
  onWave,
}: {
  target: { id: string; model: TeslaModel; colour: string } | null;
  onWave: (id: string) => void;
}): ReactNode {
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!target) return;
    const timer = setTimeout(() => setExpired(true), WAVE_PROMPT_TTL_MS);
    return () => clearTimeout(timer);
  }, [target]);

  if (!target || expired) return null;
  return (
    <button type="button" data-touch className="wave" onClick={() => onWave(target.id)}>
      {COPY.wave.prompt(target.model, target.colour)}
      <span className="wave__countdown" aria-hidden />
    </button>
  );
}
