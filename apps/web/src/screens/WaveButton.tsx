import { useEffect, useState, type ReactNode } from 'react';
import { WAVE_PROMPT_RANGE_M, WAVE_PROMPT_TTL_MS, type TeslaModel } from '@teslawave/protocol';
import { CarSvg } from '../ui/CarSvg';
import { WaveIcon } from '../ui/icons';
import { COPY } from '../ui/copy';

type Phase = 'shown' | 'leaving' | 'done';

/** Long enough for the exit animation in app.css to finish before the node goes. */
const LEAVE_MS = 260;

/**
 * Appears when another car comes within WAVE_PROMPT_RANGE_M and stays for ten seconds, or
 * until they are out of range, or until you wave at them. It carries the actual car you would
 * be waving at, so there is nothing to read: the countdown is a bar running out under the name.
 *
 * Everything here is keyed on *which* car. The summary hands over a fresh `target` object
 * twice a second, and the first version kept one `expired` flag that never came back down:
 * the first prompt of the drive was the last one, and a car that stayed alongside for a
 * minute could never be waved at from here again.
 */
export function WaveButton({
  target,
  onWave,
}: {
  target: { id: string; model: TeslaModel; colour: string } | null;
  onWave: (id: string) => void;
}): ReactNode {
  const id = target?.id ?? null;
  const [state, setState] = useState<{ id: string | null; phase: Phase }>({
    id,
    phase: id ? 'shown' : 'done',
  });
  // The documented "adjust state during render" pattern: a new car (or none) resets the phase
  // before anything is painted, with no effect and no extra frame.
  if (id !== state.id) setState({ id, phase: id ? 'shown' : 'done' });
  const phase = id === state.id ? state.phase : id ? 'shown' : 'done';

  useEffect(() => {
    if (!id || phase !== 'shown') return;
    const timer = setTimeout(() => setState({ id, phase: 'leaving' }), WAVE_PROMPT_TTL_MS);
    return () => clearTimeout(timer);
  }, [id, phase]);

  useEffect(() => {
    if (!id || phase !== 'leaving') return;
    const timer = setTimeout(() => setState({ id, phase: 'done' }), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [id, phase]);

  if (!target || phase === 'done') return null;
  // The visible label is split across two lines; assistive tech gets the whole sentence.
  const label = COPY.wave.prompt(target.model, target.colour);
  return (
    <button
      type="button"
      data-touch
      className={`wave ${phase === 'leaving' ? 'wave--leaving' : ''}`.trim()}
      aria-label={label}
      title={`${label} (within ${WAVE_PROMPT_RANGE_M} m)`}
      disabled={phase === 'leaving'}
      onClick={() => {
        onWave(target.id);
        // Sent: the button goes, and this car does not get a second prompt until it has been
        // out of range and back. Tapping the car on the map still waves again.
        setState({ id: target.id, phase: 'leaving' });
      }}
    >
      <span className="wave__halo" aria-hidden />
      <span className="wave__car" aria-hidden>
        <CarSvg model={target.model} colour={target.colour} size={62} heading={90} />
      </span>
      {/* Verb first: "Wave at the pearl white Model 3" wrapped to two lines on a phone and
          buried the one word that matters. */}
      <span className="wave__text">
        <span className="wave__verb">{COPY.wave.verb}</span>
        <span className="wave__target">{COPY.wave.promptTarget(target.model, target.colour)}</span>
        {/* The window, as a bar that runs out. Its length is the protocol's, not the CSS's. */}
        <span className="wave__track" aria-hidden>
          <span
            className="wave__countdown"
            style={{ animationDuration: `${WAVE_PROMPT_TTL_MS}ms` }}
          />
        </span>
      </span>
      <span className="wave__icon" aria-hidden>
        <WaveIcon size={28} />
      </span>
    </button>
  );
}
