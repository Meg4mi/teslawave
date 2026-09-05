import { useEffect, useState, type ReactNode } from 'react';
import { WAVE_PROMPT_RANGE_M, WAVE_PROMPT_TTL_MS, type TeslaModel } from '@teslawave/protocol';
import { CarSvg } from '../ui/CarSvg';
import { WaveIcon } from '../ui/icons';
import { useCopy } from '../i18n';

type Phase = 'shown' | 'leaving' | 'done';

/** Long enough for the exit animation in app.css to finish before the node goes. */
const LEAVE_MS = 260;

export type WaveTarget = {
  id: string;
  model: TeslaModel;
  colour: string;
  /** They waved first: the button comes back warm, and the verb is "Wave back". */
  back?: boolean;
  /**
   * A new prompt for a car the button has already been shown for. A received wave bumps it,
   * so a car that has been alongside for a minute (whose window ran out long ago) gets a
   * fresh window the moment it waves at you.
   */
  prompt?: number;
};

/**
 * Appears when another car comes within WAVE_PROMPT_RANGE_M and stays for ten seconds, or
 * until they are out of range, or until you wave at them. It carries the actual car you would
 * be waving at, so there is nothing to read: the countdown is a bar running out under the name.
 *
 * Everything here is keyed on *which* car, and on which prompt. The summary hands over a
 * fresh `target` object twice a second, and the first version kept one `expired` flag that
 * never came back down: the first prompt of the drive was the last one, and a car that stayed
 * alongside for a minute could never be waved at from here again.
 */
export function WaveButton({
  target,
  onWave,
}: {
  target: WaveTarget | null;
  onWave: (id: string) => void;
}): ReactNode {
  const copy = useCopy();
  const id = target?.id ?? null;
  const prompt = target?.prompt ?? 0;
  const [state, setState] = useState<{ id: string | null; prompt: number; phase: Phase }>({
    id,
    prompt,
    phase: id ? 'shown' : 'done',
  });
  // The documented "adjust state during render" pattern: a new car (or none), or a *later*
  // prompt for the same car, resets the phase before anything is painted, with no effect and
  // no extra frame. Later, not merely different: when the "wave back" offer lapses the parent
  // hands the same car back with no prompt at all, and that must not read as a new approach.
  const fresh = id !== state.id || prompt > state.prompt;
  if (fresh) setState({ id, prompt, phase: id ? 'shown' : 'done' });
  const phase = fresh ? (id ? 'shown' : 'done') : state.phase;
  const generation = fresh ? prompt : state.prompt;

  useEffect(() => {
    if (!id || phase !== 'shown') return;
    const timer = setTimeout(
      () => setState((s) => ({ ...s, phase: 'leaving' })),
      WAVE_PROMPT_TTL_MS,
    );
    return () => clearTimeout(timer);
  }, [id, generation, phase]);

  useEffect(() => {
    if (!id || phase !== 'leaving') return;
    const timer = setTimeout(() => setState((s) => ({ ...s, phase: 'done' })), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [id, generation, phase]);

  if (!target || phase === 'done') return null;
  // The visible label is split across two lines; assistive tech gets the whole sentence.
  const verb = target.back ? copy.wave.backVerb : copy.wave.verb;
  const label = target.back
    ? `${verb} ${copy.wave.promptTarget(target.model, target.colour)}`
    : copy.wave.prompt(target.model, target.colour);
  const className = [
    'wave',
    target.back ? 'wave--back' : '',
    phase === 'leaving' ? 'wave--leaving' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      data-touch
      className={className}
      aria-label={label}
      title={copy.wave.within(label, WAVE_PROMPT_RANGE_M)}
      disabled={phase === 'leaving'}
      onClick={() => {
        onWave(target.id);
        // Sent: the button goes, and this car does not get a second prompt until it has been
        // out of range and back, or until it waves at you. Tapping the car on the map still
        // waves again.
        setState((s) => ({ ...s, phase: 'leaving' }));
      }}
    >
      <span className="wave__halo" aria-hidden />
      <span className="wave__car" aria-hidden>
        <CarSvg model={target.model} colour={target.colour} size={62} heading={90} />
      </span>
      {/* Verb first: "Wave at the pearl white Model 3" wrapped to two lines on a phone and
          buried the one word that matters. */}
      <span className="wave__text">
        <span className="wave__verb">{verb}</span>
        <span className="wave__target">{copy.wave.promptTarget(target.model, target.colour)}</span>
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
