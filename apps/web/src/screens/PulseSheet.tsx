import type { ReactNode } from 'react';
import { Button, Counter, Sheet } from '../ui/primitives';
import { COPY } from '../ui/copy';
import type { Summary } from '../sim/world';

/** Derived from the map cells you are in, never from a database of regions or people. */
export function PulseSheet({
  summary,
  onClose,
}: {
  summary: Summary;
  onClose: () => void;
}): ReactNode {
  return (
    <Sheet label={COPY.pulse.title} onClose={onClose}>
      <h2 className="card-sheet__title">{COPY.pulse.title}</h2>
      <dl className="pulse">
        <div className="pulse__item">
          <dt>{COPY.pulse.online}</dt>
          <dd className="num">
            <Counter value={summary.online} />
          </dd>
        </div>
        <div className="pulse__item">
          <dt>{COPY.pulse.waves}</dt>
          <dd className="num">
            <Counter value={summary.wavesToday} />
          </dd>
        </div>
        <div className="pulse__item">
          <dt>{COPY.wave.counter}</dt>
          <dd className="num">
            <Counter value={summary.selfWaves} />
          </dd>
        </div>
      </dl>
      <p className="hud__note">{COPY.pulse.note}</p>
      <div className="card-sheet__actions">
        <Button variant="ghost" onClick={onClose}>
          {COPY.controls.close}
        </Button>
      </div>
    </Sheet>
  );
}
