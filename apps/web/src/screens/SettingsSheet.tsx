import type { ReactNode } from 'react';
import { Button, Sheet } from '../ui/primitives';
import { COPY } from '../ui/copy';
import { Disclaimer } from '../ui/Disclaimer';
import type { Prefs } from '../identity/store';

export function SettingsSheet({
  prefs,
  onChange,
  onShowPairing,
  onEnterCode,
  onClose,
}: {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
  onShowPairing: () => void;
  onEnterCode: () => void;
  onClose: () => void;
}): ReactNode {
  return (
    <Sheet label={COPY.controls.settings} onClose={onClose}>
      <h2 className="card-sheet__title">{COPY.controls.settings}</h2>

      <div className="settings__row">
        <span className="settings__label">
          {COPY.controls.invisible}
          <span className="settings__hint">{COPY.map.hidden}</span>
        </span>
        <Button onClick={() => onChange({ sharing: !prefs.sharing })}>
          {prefs.sharing ? COPY.controls.visible : COPY.controls.invisible}
        </Button>
      </div>

      <div className="settings__row">
        <span className="settings__label">Sounds</span>
        <Button onClick={() => onChange({ muted: !prefs.muted })}>
          {prefs.muted ? COPY.controls.unmute : COPY.controls.mute}
        </Button>
      </div>

      <div className="settings__row">
        <span className="settings__label">Map orientation</span>
        <Button onClick={() => onChange({ northUp: !prefs.northUp })}>
          {prefs.northUp ? COPY.controls.northUp : COPY.controls.trackUp}
        </Button>
      </div>

      <div className="card-sheet__actions">
        <Button variant="primary" onClick={onShowPairing}>
          {COPY.pairing.showTitle}
        </Button>
        <Button variant="ghost" onClick={onEnterCode}>
          {COPY.onboarding.havePairingCode}
        </Button>
      </div>

      <Disclaimer inline />
    </Sheet>
  );
}
