import { useEffect, useState, type ReactNode } from 'react';
import { WAVE_PROMPT_TTL_MS, type TeslaModel } from '@teslawave/protocol';
import { CarSvg } from '../ui/CarSvg';
import { WaveIcon } from '../ui/icons';
import { COPY } from '../ui/copy';

/**
 * Appears when another car comes within 150 m and stays for ten seconds, or until they are
 * out of range. It carries the actual car you would be waving at, so there is nothing to
 * read: the countdown is a hairline running out along the bottom edge.
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
  // The visible label is split across two lines; assistive tech gets the whole sentence.
  const label = COPY.wave.prompt(target.model, target.colour);
  return (
    <button
      type="button"
      data-touch
      className="wave"
      aria-label={label}
      onClick={() => onWave(target.id)}
    >
      <span className="wave__car" aria-hidden>
        <CarSvg model={target.model} colour={target.colour} size={56} heading={90} />
      </span>
      {/* Verb first: "Wave at the pearl white Model 3" wrapped to two lines on a phone and
          buried the one word that matters. */}
      <span className="wave__text">
        <span className="wave__verb">{COPY.wave.verb}</span>
        <span className="wave__target">{COPY.wave.promptTarget(target.model, target.colour)}</span>
      </span>
      <span className="wave__icon" aria-hidden>
        <WaveIcon size={28} />
      </span>
      <span className="wave__countdown" aria-hidden />
    </button>
  );
}
