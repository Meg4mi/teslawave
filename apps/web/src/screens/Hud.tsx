import type { ReactNode } from 'react';
import { Counter } from '../ui/primitives';
import { useCopy } from '../i18n';
import type { Summary } from '../sim/world';
import type { NetStatus } from '../net/sockets';

export function Hud({
  summary,
  status,
  locating,
  onOpenPulse,
  onHowItWorks,
}: {
  summary: Summary;
  status: NetStatus;
  /** Waiting on the device for a first fix, which is not a connection problem. */
  locating: boolean;
  onOpenPulse: () => void;
  onHowItWorks: () => void;
}): ReactNode {
  const copy = useCopy();
  const live = status === 'live';
  const ago = copy.agoLabel(summary.lastWaveTs, summary.serverNow);

  return (
    <div className="hud">
      {/* While the socket is down these numbers are whatever the hub last said, which may be
          minutes old. Dimming them is the honest version of "we don't know right now". */}
      <button
        type="button"
        data-touch
        className={`hud__stats ${live ? '' : 'hud__stats--stale'}`.trim()}
        aria-label={copy.pulse.title}
        onClick={onOpenPulse}
      >
        <span className={`hud__dot ${live ? '' : 'hud__dot--offline'}`.trim()} />
        <span className="hud__row">
          <Counter value={summary.online} />
          <span>{copy.map.onlineLabel}</span>
          <span className="hud__sep">·</span>
          <Counter value={summary.near} />
          <span>{copy.map.nearLabel}</span>
          {ago ? (
            <>
              <span className="hud__sep">·</span>
              <span>{copy.map.lastWave(ago)}</span>
            </>
          ) : null}
        </span>
      </button>

      {/* One state at a time: a driver glancing at this should read one line, not three.
          Three ways of not being on the map yet, and they are not the same thing: waiting on
          the phone for a position, opening the socket for the first time, and having lost
          one. Saying "Reconnecting…" to all three sent drivers looking for a network fault
          while their phone was quietly still asking them for their location. */}
      {locating ? (
        <p className="hud__note">{copy.map.locating}</p>
      ) : status === 'connecting' ? (
        <p className="hud__note">{copy.map.connecting}</p>
      ) : status === 'reconnecting' ? (
        <p className="hud__note">{copy.map.reconnecting}</p>
      ) : summary.near === 0 ? (
        <>
          <p className="hud__note">{copy.map.quiet(summary.online)}</p>
          {/* The one gesture this app exists for is undiscoverable on an empty road. */}
          <button type="button" data-touch className="hud__link" onClick={onHowItWorks}>
            {copy.map.quietHow}
          </button>
        </>
      ) : null}
    </div>
  );
}
