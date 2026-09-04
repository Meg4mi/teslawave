import type { ReactNode } from 'react';
import { Counter } from '../ui/primitives';
import { agoLabel, COPY } from '../ui/copy';
import type { Summary } from '../sim/world';
import type { NetStatus } from '../net/sockets';

export function Hud({
  summary,
  status,
  onOpenPulse,
  onHowItWorks,
}: {
  summary: Summary;
  status: NetStatus;
  onOpenPulse: () => void;
  onHowItWorks: () => void;
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

      {/* One state at a time: a driver glancing at this should read one line, not three. */}
      {status === 'reconnecting' || status === 'connecting' ? (
        <p className="hud__note">{COPY.map.reconnecting}</p>
      ) : summary.near === 0 ? (
        <>
          <p className="hud__note">{COPY.map.quiet(summary.online)}</p>
          {/* The one gesture this app exists for is undiscoverable on an empty road. */}
          <button type="button" data-touch className="hud__link" onClick={onHowItWorks}>
            {COPY.map.quietHow}
          </button>
        </>
      ) : null}
    </div>
  );
}
