import type { ReactNode } from 'react';
import { Counter } from '../ui/primitives';
import { agoLabel, COPY } from '../ui/copy';
import type { Summary } from '../sim/world';
import type { NetStatus } from '../net/sockets';

export function Hud({
  summary,
  status,
  onOpenPulse,
}: {
  summary: Summary;
  status: NetStatus;
  onOpenPulse: () => void;
}): ReactNode {
  const live = status === 'live';
  const ago = agoLabel(summary.lastWaveTs, summary.serverNow);

  return (
    <div className="hud">
      <button type="button" data-touch className="hud__stats" onClick={onOpenPulse}>
        <span className={`hud__dot ${live ? '' : 'hud__dot--offline'}`.trim()} />
        <span className="hud__row">
          <Counter value={summary.online} />
          <span>online</span>
          <span className="hud__sep">·</span>
          <Counter value={summary.near} />
          <span>within 10 km</span>
          {ago ? (
            <>
              <span className="hud__sep">·</span>
              <span>{COPY.map.lastWave(ago)}</span>
            </>
          ) : null}
        </span>
      </button>

      {summary.near === 0 ? <p className="hud__note">{COPY.map.quiet(summary.online)}</p> : null}
      {status === 'reconnecting' ? <p className="hud__note">{COPY.map.reconnecting}</p> : null}
    </div>
  );
}
