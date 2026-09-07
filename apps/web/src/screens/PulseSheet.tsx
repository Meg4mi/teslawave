import type { ReactNode } from 'react';
import { Button, Counter, Sheet, SheetActions } from '../ui/primitives';
import { useCopy } from '../i18n';
import type { Summary } from '../sim/world';

/** Derived from the map cells you are in, never from a database of regions or people. */
export function PulseSheet({
  summary,
  onShare,
  onClose,
}: {
  summary: Summary;
  /**
   * Offered here and nowhere else. This is a sheet a driver opens on purpose, usually
   * stopped; a share button on the wave itself would be asking someone to compose a post at
   * 100 km/h.
   */
  onShare?: () => void;
  onClose: () => void;
}): ReactNode {
  const copy = useCopy();
  return (
    <Sheet label={copy.pulse.title} title={copy.pulse.title} onClose={onClose}>
      <dl className="pulse">
        <div className="pulse__item">
          <dt className="eyebrow">{copy.pulse.online}</dt>
          <dd className="num">
            <Counter value={summary.online} />
          </dd>
        </div>
        <div className="pulse__item">
          <dt className="eyebrow">{copy.pulse.waves}</dt>
          <dd className="num">
            <Counter value={summary.wavesToday} />
          </dd>
        </div>
        <div className="pulse__item">
          <dt className="eyebrow">{copy.pulse.mine}</dt>
          <dd className="num">
            <Counter value={summary.selfWaves} />
          </dd>
        </div>
      </dl>
      <p className="sheet__note">{copy.pulse.note}</p>
      {/* Nothing to share until there is something to be proud of. */}
      {onShare && summary.selfWaves > 0 ? (
        <SheetActions>
          <Button onClick={onShare}>{copy.pulse.share}</Button>
        </SheetActions>
      ) : null}
    </Sheet>
  );
}
